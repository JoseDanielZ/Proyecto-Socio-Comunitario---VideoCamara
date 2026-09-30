"""Adaptador entre el backend y el motor de visión (src/lpr).

Corre el pipeline en un hilo: cada fotograma se detecta, se sigue, se anota y se publica como
JPEG (video en vivo); cada vehículo que cruza la línea se guarda como VehicleEvent."""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable, Iterator
from datetime import datetime, timezone
from pathlib import Path

import cv2

from ...application.cameras.service import CameraGateway, CameraInfo
from ...application.vehicle_events.service import VehicleEventService
from ...config import PROJECT_ROOT, Settings
from ...domain.entities.vehicle_event import VehicleEvent
from ...domain.value_objects.enums import VehicleType
from ...domain.value_objects.plate import normalize
from .frame_hub import FrameHub

logger = logging.getLogger(__name__)


class EventSink:
    """Recibe los eventos del pipeline (lpr.db.Event) y los guarda como VehicleEvent."""

    def __init__(self, camera_id: str, events: VehicleEventService):
        self._camera_id = camera_id
        self._events = events

    def insert(self, event) -> None:
        try:
            vehicle_type = VehicleType(event.vehicle_type)
        except ValueError:
            logger.warning("Tipo de vehículo desconocido '%s'; evento descartado", event.vehicle_type)
            return
        occurred_at = datetime.fromisoformat(event.timestamp)
        if occurred_at.tzinfo is None:
            occurred_at = occurred_at.replace(tzinfo=timezone.utc)
        self._events.record(
            VehicleEvent(
                camera_id=self._camera_id,
                occurred_at=occurred_at,
                vehicle_type=vehicle_type,
                color=event.vehicle_color,
                plate_text=normalize(event.plate_text) or None if event.plate_text else None,
                plate_confidence=event.plate_confidence,
                direction=event.direction,
                tracker_id=event.tracker_id,
                snapshot_path=event.snapshot_path,
            )
        )

    def close(self) -> None:  # el pipeline no es dueño de este destino; nada que cerrar
        pass


def _absolute(value: str) -> str:
    path = Path(value)
    return str(path if path.is_absolute() else PROJECT_ROOT / path)


def _default_config_loader(settings: Settings):
    from lpr.config import load_config  # import diferido: aún no carga torch

    config = load_config(settings.lpr_config_path)
    if config.source.type == "file":
        config.source.path_or_url = _absolute(config.source.path_or_url)
    config.source.source_id = settings.camera_id
    config.source.loop = settings.camera_loop
    config.models.vehicle_detector_weights = _absolute(config.models.vehicle_detector_weights)
    config.snapshots.directory = str(settings.snapshots_dir)
    return config


def _default_source_factory(source_config):
    from lpr.video_source import VideoSource

    return VideoSource(source_config)


def _default_pipeline_factory(config, frame_rate, sink):
    from lpr.pipeline import Pipeline  # carga torch/ultralytics (lento)

    return Pipeline(config, frame_rate=frame_rate, repository=sink)


class LprCameraRuntime(CameraGateway):
    def __init__(
        self,
        settings: Settings,
        events: VehicleEventService,
        hub: FrameHub | None = None,
        config_loader: Callable | None = None,
        source_factory: Callable | None = None,
        pipeline_factory: Callable | None = None,
    ):
        self._settings = settings
        self._events = events
        self._hub = hub or FrameHub()
        self._config_loader = config_loader or _default_config_loader
        self._source_factory = source_factory or _default_source_factory
        self._pipeline_factory = pipeline_factory or _default_pipeline_factory
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._status = "stopped"
        self._detail: str | None = None
        self._crossings = 0

    # ---- ciclo de vida ------------------------------------------------------------
    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._status, self._detail = "starting", "Cargando modelos..."
        self._thread = threading.Thread(target=self._run, name="camera-worker", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=15)
        if self._status in ("starting", "running"):
            self._status = "stopped"

    def _run(self) -> None:
        pipeline = None
        try:
            config = self._config_loader(self._settings)
            sink = EventSink(self._settings.camera_id, self._events)
            with self._source_factory(config.source) as source:
                info = source.info
                pipeline = self._pipeline_factory(config, info.fps, sink)
                from lpr.annotators import DebugAnnotator

                annotator = DebugAnnotator(pipeline.line_zones)
                frame_interval = 1.0 / info.fps if config.source.type == "file" and self._settings.camera_realtime else 0.0
                quality = [cv2.IMWRITE_JPEG_QUALITY, self._settings.camera_jpeg_quality]
                self._status, self._detail = "running", None

                for frame in source.frames():
                    if self._stop.is_set():
                        break
                    started = time.monotonic()
                    detections = pipeline.process(frame)
                    crossings = pipeline.crossing_summary()
                    self._crossings = len(crossings)
                    ok, jpeg = cv2.imencode(".jpg", annotator.annotate(frame, detections, crossings), quality)
                    if ok:
                        self._hub.publish(self._settings.camera_id, jpeg.tobytes())
                    if frame_interval:
                        time.sleep(max(0.0, frame_interval - (time.monotonic() - started)))

            if not self._stop.is_set():
                self._status, self._detail = "finished", "El video de prueba terminó"
        except Exception as exc:  # el hilo nunca debe tumbar la API
            logger.exception("Falló el procesamiento de la cámara")
            self._status, self._detail = "error", f"{type(exc).__name__}: {exc}"
        finally:
            if pipeline is not None:
                pipeline.close()

    # ---- CameraGateway ------------------------------------------------------------
    def list_cameras(self) -> list[CameraInfo]:
        s = self._settings
        return [CameraInfo(s.camera_id, s.camera_name, self._status, self._detail, self._crossings)]

    def latest_jpeg(self, camera_id: str) -> bytes | None:
        return self._hub.latest(camera_id)

    def stream_jpegs(self, camera_id: str) -> Iterator[bytes]:
        seq = 0
        while not self._stop.is_set():
            item = self._hub.wait_next(camera_id, seq, timeout=1.0)
            if item is None:
                if self._status not in ("starting", "running"):
                    return  # terminó o falló: cerrar el stream; el navegador conserva el último cuadro
                continue
            seq, jpeg = item
            yield jpeg
