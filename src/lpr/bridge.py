"""Puente entre el motor de visión (Python) y el backend (Node.js).

Corre el pipeline sobre un video o una cámara RTSP y, por HTTP, le envía al backend:
  - cada vehículo que cruza la línea (tipo, color, placa, hora, foto),
  - el último fotograma anotado (para el video en vivo de la web),
  - el estado de la cámara (cargando, en vivo, terminó, falló) y cuántos vehículos contó.

    python -m lpr.bridge --api http://localhost:8000 --key <INGEST_API_KEY> --camera-id entrada
"""

from __future__ import annotations

import argparse
import logging
import os
import threading
import time
from collections.abc import Callable
from pathlib import Path

import cv2
import httpx

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
HEARTBEAT_SECONDS = 3.0


class BackendClient:
    """Habla con las rutas internas del backend. Un fallo de red nunca detiene el procesamiento."""

    def __init__(self, base_url: str, api_key: str, camera_id: str, client: httpx.Client | None = None):
        self._camera_id = camera_id
        self._http = client or httpx.Client(
            base_url=base_url.rstrip("/"), headers={"X-Ingest-Key": api_key}, timeout=5.0
        )

    def close(self) -> None:
        self._http.close()

    def _send(self, method: str, path: str, **kwargs) -> bool:
        try:
            response = self._http.request(method, path, **kwargs)
        except httpx.HTTPError as exc:
            logger.warning("No se pudo contactar al backend (%s %s): %s", method, path, exc)
            return False
        if response.status_code >= 400:
            logger.warning("El backend rechazó %s %s: %s %s", method, path, response.status_code, response.text[:200])
            return False
        return True

    def send_event(self, payload: dict) -> bool:
        # Un evento no se puede reconstruir después: se reintenta unas veces antes de rendirse.
        for attempt in range(3):
            if self._send("POST", "/api/internal/vehicle-events", json=payload):
                return True
            time.sleep(0.5 * (attempt + 1))
        logger.error("Evento perdido tras 3 intentos: %s", payload)
        return False

    def send_frame(self, jpeg: bytes) -> bool:
        return self._send(
            "PUT", f"/api/internal/cameras/{self._camera_id}/frame", content=jpeg,
            headers={"Content-Type": "image/jpeg"},
        )

    def send_status(self, status: str, detail: str | None, crossings: int) -> bool:
        return self._send(
            "POST", f"/api/internal/cameras/{self._camera_id}/status",
            json={"status": status, "detail": detail, "crossings": crossings},
        )


class EventSink:
    """Destino de los eventos del Pipeline: los convierte al formato de la API y los envía."""

    def __init__(self, client: BackendClient, camera_id: str):
        self._client = client
        self._camera_id = camera_id

    def insert(self, event) -> None:  # `event` es lpr.db.Event
        self._client.send_event(
            {
                "camera_id": self._camera_id,
                "occurred_at": event.timestamp,
                "vehicle_type": event.vehicle_type,
                "color": event.vehicle_color,
                "plate_text": event.plate_text,
                "plate_confidence": event.plate_confidence,
                "direction": event.direction,
                "tracker_id": event.tracker_id,
                # El backend solo recibe el nombre del archivo, nunca una ruta.
                "snapshot_file": Path(event.snapshot_path).name if event.snapshot_path else None,
            }
        )

    def close(self) -> None:  # el Pipeline no es dueño de este destino
        pass


class Heartbeat:
    """Avisa el estado cada pocos segundos, también mientras se cargan los modelos (que tarda)."""

    def __init__(self, client: BackendClient):
        self._client = client
        self._lock = threading.Lock()
        self._state = ("starting", "Cargando modelos...", 0)
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="bridge-heartbeat", daemon=True)

    def set(self, status: str, detail: str | None = None, crossings: int = 0) -> None:
        with self._lock:
            self._state = (status, detail, crossings)

    def push_now(self) -> None:
        with self._lock:
            status, detail, crossings = self._state
        self._client.send_status(status, detail, crossings)

    def _run(self) -> None:
        while not self._stop.wait(HEARTBEAT_SECONDS):
            self.push_now()

    def start(self) -> None:
        self.push_now()
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=2)


def run_bridge(
    config,
    client: BackendClient,
    camera_id: str,
    *,
    source_factory: Callable,
    pipeline_factory: Callable,
    annotator_factory: Callable,
    realtime: bool = True,
    max_fps: float = 12.0,
    jpeg_quality: int = 75,
    should_stop: Callable[[], bool] = lambda: False,
) -> str:
    """Procesa el video hasta que termina; devuelve el estado final (finished | error | stopped)."""
    heartbeat = Heartbeat(client)
    heartbeat.start()
    pipeline = None
    final = "finished"
    try:
        with source_factory(config.source) as source:
            info = source.info
            pipeline = pipeline_factory(config, info.fps, EventSink(client, camera_id))
            annotator = annotator_factory(pipeline.line_zones)
            frame_interval = 1.0 / info.fps if realtime and config.source.type == "file" else 0.0
            send_interval = 1.0 / max_fps
            quality = [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality]
            last_sent = 0.0
            heartbeat.set("running")

            for frame in source.frames():
                if should_stop():
                    final = "stopped"
                    break
                started = time.monotonic()
                detections = pipeline.process(frame)
                crossings = pipeline.crossing_summary()
                heartbeat.set("running", None, len(crossings))

                # No se envían todos los fotogramas: 12 por segundo bastan para verse fluido.
                if started - last_sent >= send_interval:
                    ok, jpeg = cv2.imencode(".jpg", annotator.annotate(frame, detections, crossings), quality)
                    if ok:
                        client.send_frame(jpeg.tobytes())
                        last_sent = started
                if frame_interval:
                    time.sleep(max(0.0, frame_interval - (time.monotonic() - started)))

            crossings_total = len(pipeline.crossing_summary()) if pipeline else 0
            if final == "finished":
                heartbeat.set("finished", "El video de prueba terminó", crossings_total)
            else:
                heartbeat.set("stopped", "Detenido", crossings_total)
    except KeyboardInterrupt:
        heartbeat.set("stopped", "Detenido", len(pipeline.crossing_summary()) if pipeline else 0)
        raise
    except Exception as exc:  # el puente nunca debe morir en silencio: se reporta al backend
        logger.exception("Falló el procesamiento de la cámara")
        final = "error"
        heartbeat.set("error", f"{type(exc).__name__}: {exc}"[:300], 0)
    finally:
        if pipeline is not None:
            pipeline.close()
        heartbeat.stop()
        heartbeat.push_now()
    return final


def read_env_value(env_file: Path, name: str) -> str | None:
    """Lee NOMBRE=valor de un archivo .env (sin dependencias). Sirve para compartir INGEST_API_KEY con el backend."""
    try:
        lines = env_file.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    for line in lines:
        key, sep, value = line.partition("=")
        if sep and key.strip() == name:
            return value.strip().strip("\"'") or None
    return None


def _absolute(value: str) -> str:
    path = Path(value)
    return str(path if path.is_absolute() else PROJECT_ROOT / path)


def _load_config(args):
    from .config import load_config

    config = load_config(_absolute(args.config))
    if args.video:
        config.source.type, config.source.path_or_url = "file", args.video
    if config.source.type == "file":
        config.source.path_or_url = _absolute(config.source.path_or_url)
    config.source.source_id = args.camera_id
    config.source.loop = args.loop or config.source.loop
    config.models.vehicle_detector_weights = _absolute(config.models.vehicle_detector_weights)
    config.snapshots.directory = _absolute(args.snapshots_dir)
    return config


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Envía al backend lo que ve una cámara o un video")
    parser.add_argument("--config", default="config/config.yaml")
    parser.add_argument("--api", default=os.environ.get("CONJUNTO_API", "http://127.0.0.1:8000"))
    parser.add_argument(
        "--key",
        default=os.environ.get("INGEST_API_KEY") or read_env_value(PROJECT_ROOT / "backend" / ".env", "INGEST_API_KEY"),
        help="clave de ingesta; por defecto INGEST_API_KEY del entorno o de backend/.env",
    )
    parser.add_argument("--camera-id", default=os.environ.get("CAMERA_ID", "entrada"))
    parser.add_argument("--video", help="usar este video en vez de la fuente de config.yaml")
    parser.add_argument("--loop", action="store_true", help="repetir el video sin fin")
    parser.add_argument("--no-realtime", action="store_true", help="procesar lo más rápido posible")
    parser.add_argument("--snapshots-dir", default=os.environ.get("SNAPSHOTS_DIR", "data/snapshots"))
    parser.add_argument("--max-fps", type=float, default=12.0)
    args = parser.parse_args(argv)
    if not args.key:
        parser.error("falta la clave de ingesta: defínela en backend/.env (INGEST_API_KEY) o usa --key")

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)  # una línea por fotograma es puro ruido
    config = _load_config(args)
    client = BackendClient(args.api, args.key, args.camera_id)

    def pipeline_factory(cfg, fps, sink):
        from .pipeline import Pipeline  # carga torch/ultralytics (lento)

        return Pipeline(cfg, frame_rate=fps, repository=sink)

    def source_factory(source_config):
        from .video_source import VideoSource

        return VideoSource(source_config)

    def annotator_factory(line_zones):
        from .annotators import DebugAnnotator

        return DebugAnnotator(line_zones)

    try:
        final = run_bridge(
            config, client, args.camera_id,
            source_factory=source_factory, pipeline_factory=pipeline_factory,
            annotator_factory=annotator_factory, realtime=not args.no_realtime, max_fps=args.max_fps,
        )
    except KeyboardInterrupt:
        final = "stopped"
    finally:
        client.close()
    logger.info("Puente terminado: %s", final)
    return 0 if final in ("finished", "stopped") else 1


if __name__ == "__main__":
    raise SystemExit(main())
