from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
import supervision as sv

from .config import Config
from .db import Event, EventRepository
from .detection import COCO_VEHICLE_CLASS_IDS, VehicleDetector
from .line_zone import CrossingEvent, LineZoneManager
from .ocr import FastAlprOCR
from .plate_detector import crop_vehicle
from .tracking import create_tracker

logger = logging.getLogger(__name__)

_CLASS_ID_TO_NAME = {v: k for k, v in COCO_VEHICLE_CLASS_IDS.items()}


class Pipeline:
    def __init__(self, config: Config, frame_rate: float = 25.0):
        self._config = config
        self._detector = VehicleDetector(
            weights_path=config.models.vehicle_detector_weights,
            vehicle_classes=config.models.vehicle_classes,
            confidence_threshold=config.models.vehicle_confidence_threshold,
            nms_threshold=config.models.nms_threshold,
        )
        self._tracker = create_tracker(frame_rate)
        self._line_zones = LineZoneManager(config.line_zones)
        self._ocr = FastAlprOCR(
            detector_model=config.models.plate_detector_model,
            ocr_model=config.models.ocr_model,
        )
        self._repository = EventRepository(config.database.path)
        self._snapshots_dir = Path(config.snapshots.directory)
        if config.snapshots.enabled:
            self._snapshots_dir.mkdir(parents=True, exist_ok=True)
        # Resguardo adicional: LineZone ya evita disparar dos veces por el
        # mismo tracker_id/dirección, pero su estado no sobrevive a un
        # reinicio del proceso, así que se refuerza aquí.
        self._logged_crossings: set[tuple[int, str]] = set()

    @property
    def line_zones(self) -> LineZoneManager:
        return self._line_zones

    def close(self) -> None:
        self._repository.close()

    def __enter__(self) -> "Pipeline":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def process(self, frame: np.ndarray) -> sv.Detections:
        detections = self._detector.detect(frame)
        detections = self._tracker.update_with_detections(detections)

        for crossing in self._line_zones.trigger(detections):
            self._handle_crossing(frame, detections, crossing)

        return detections

    def _handle_crossing(
        self, frame: np.ndarray, detections: sv.Detections, crossing: CrossingEvent
    ) -> None:
        tracker_id = detections.tracker_id[crossing.detection_index]
        dedup_key = (int(tracker_id), crossing.direction)
        if dedup_key in self._logged_crossings:
            return
        self._logged_crossings.add(dedup_key)

        class_id = int(detections.class_id[crossing.detection_index])
        vehicle_type = _CLASS_ID_TO_NAME.get(class_id, "unknown")
        xyxy = detections.xyxy[crossing.detection_index]
        vehicle_crop = crop_vehicle(frame, xyxy)

        plate_text, plate_confidence = None, None
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
            direction=crossing.direction,
            source_id=self._config.source.source_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            plate_text=plate_text,
            plate_confidence=plate_confidence,
            tracker_id=int(tracker_id),
            snapshot_path=snapshot_path,
        )
        self._repository.insert(event)
        logger.info(
            "Evento registrado: %s %s placa=%s tracker_id=%s",
            vehicle_type,
            crossing.direction,
            plate_text or "(no leída)",
            tracker_id,
        )
