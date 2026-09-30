from __future__ import annotations

import logging
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
import supervision as sv

from .color import classify_vehicle_color
from .config import Config
from .db import Event, EventRepository
from .detection import VehicleDetector
from .line_zone import CrossingEvent, LineZoneManager
from .ocr import FastAlprOCR
from .plate_detector import crop_vehicle
from .tracking import create_tracker

logger = logging.getLogger(__name__)


class Pipeline:
    def __init__(self, config: Config, frame_rate: float = 25.0):
        self._config = config
        self._detector = VehicleDetector(
            weights_path=config.models.vehicle_detector_weights,
            vehicle_classes=config.models.vehicle_classes,
            confidence_threshold=config.models.vehicle_confidence_threshold,
            nms_threshold=config.models.nms_threshold,
            imgsz=config.models.imgsz,
        )
        self._class_names = self._detector.class_names
        self._tracker = create_tracker(frame_rate)
        self._line_zones = LineZoneManager(config.line_zones)
        self._ocr = (
            FastAlprOCR(
                detector_model=config.models.plate_detector_model,
                ocr_model=config.models.ocr_model,
            )
            if config.models.plate_ocr_enabled
            else None
        )
        self._repository = EventRepository(config.database.path)
        self._snapshots_dir = Path(config.snapshots.directory)
        if config.snapshots.enabled:
            self._snapshots_dir.mkdir(parents=True, exist_ok=True)
        # IDs ya contados; LineZone puede disparar de nuevo si el vehículo vibra
        # sobre la línea o cambia de sentido.
        self._logged_crossings: set[int] = set()
        # Votos de color y de tipo por tracker_id: el color de un frame suelto
        # parpadea (reflejos, sombras), así que se usa la moda acumulada del track.
        self._color_votes: dict[int, Counter[str]] = defaultdict(Counter)
        self._class_votes: dict[int, Counter[int]] = defaultdict(Counter)
        self._frames_seen: Counter[int] = Counter()
        self._crossings: list[dict] = []
        self._frame_index = 0

    @property
    def line_zones(self) -> LineZoneManager:
        return self._line_zones

    def track_summary(self) -> list[dict]:
        """Resumen por vehículo trackeado: tipo, color final y frames en que se vio."""
        summary = []
        for tracker_id in sorted(self._frames_seen):
            summary.append(
                {
                    "tracker_id": tracker_id,
                    "vehicle_type": self._track_type(tracker_id),
                    "color": self._track_color(tracker_id),
                    "frames": self._frames_seen[tracker_id],
                }
            )
        return summary

    def crossing_summary(self) -> list[dict]:
        """Un registro por vehículo contado al cruzar la línea, en orden de cruce."""
        return list(self._crossings)

    def _track_color(self, tracker_id: int) -> str:
        return self._color_votes[tracker_id].most_common(1)[0][0]

    def _track_type(self, tracker_id: int) -> str:
        # Moda del tipo a lo largo del track: una camioneta puede parpadear
        # entre 'car' y 'truck' de un frame a otro.
        class_id = self._class_votes[tracker_id].most_common(1)[0][0]
        return self._class_names.get(class_id, "unknown")

    def _annotate_colors(self, frame: np.ndarray, detections: sv.Detections) -> None:
        colors, types = [], []
        for xyxy, tracker_id, class_id in zip(
            detections.xyxy, detections.tracker_id, detections.class_id
        ):
            tracker_id = int(tracker_id)
            crop = crop_vehicle(frame, xyxy, padding=0)
            self._color_votes[tracker_id][classify_vehicle_color(crop)] += 1
            self._class_votes[tracker_id][int(class_id)] += 1
            self._frames_seen[tracker_id] += 1
            colors.append(self._track_color(tracker_id))
            types.append(self._track_type(tracker_id))
        detections.data["color"] = np.array(colors, dtype=object)
        detections.data["vehicle_type"] = np.array(types, dtype=object)

    def close(self) -> None:
        self._repository.close()

    def __enter__(self) -> "Pipeline":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def process(self, frame: np.ndarray) -> sv.Detections:
        self._frame_index += 1
        detections = self._detector.detect(frame)
        detections = self._tracker.update(detections)
        # ByteTrackTracker devuelve también las detecciones aún no
        # confirmadas con tracker_id=-1; se excluyen para que no se
        # fusionen entre sí en el conteo de cruces.
        detections = detections[detections.tracker_id != -1]
        self._annotate_colors(frame, detections)

        for crossing in self._line_zones.trigger(detections):
            self._handle_crossing(frame, detections, crossing)

        return detections

    def _handle_crossing(
        self, frame: np.ndarray, detections: sv.Detections, crossing: CrossingEvent
    ) -> None:
        tracker_id = detections.tracker_id[crossing.detection_index]
        # Un vehículo se cuenta una sola vez (su primer cruce), aunque vibre
        # sobre la línea y la cruce de nuevo en sentido contrario.
        if int(tracker_id) in self._logged_crossings:
            return
        self._logged_crossings.add(int(tracker_id))

        vehicle_type = self._track_type(int(tracker_id))
        xyxy = detections.xyxy[crossing.detection_index]
        vehicle_crop = crop_vehicle(frame, xyxy)

        plate_text, plate_confidence = None, None
        if self._ocr is not None:
            try:
                plate_text, plate_confidence = self._ocr.read(vehicle_crop)
            except Exception:
                logger.exception("Fallo leyendo la placa para tracker_id=%s", tracker_id)

        snapshot_path = None
        if self._config.snapshots.enabled and vehicle_crop.size > 0:
            timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
            snapshot_path = str(self._snapshots_dir / f"{timestamp_str}_{tracker_id}.jpg")
            cv2.imwrite(snapshot_path, vehicle_crop)

        event = Event(
            vehicle_type=vehicle_type,
            vehicle_color=self._track_color(int(tracker_id)),
            direction=crossing.direction,
            source_id=self._config.source.source_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            plate_text=plate_text,
            plate_confidence=plate_confidence,
            tracker_id=int(tracker_id),
            snapshot_path=snapshot_path,
        )
        self._repository.insert(event)
        self._crossings.append(
            {
                "tracker_id": int(tracker_id),
                "vehicle_type": vehicle_type,
                "color": event.vehicle_color,
                "direction": crossing.direction,
                "frame": self._frame_index,
            }
        )
        logger.info(
            "Evento registrado: %s %s %s placa=%s tracker_id=%s",
            vehicle_type,
            event.vehicle_color,
            crossing.direction,
            plate_text or "(no leída)",
            tracker_id,
        )
