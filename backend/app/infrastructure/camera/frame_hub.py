from __future__ import annotations

import threading


class FrameHub:
    """Guarda el último fotograma JPEG anotado de cada cámara y despierta a quien espera uno nuevo.

    El worker publica; los clientes del video en vivo (uno por navegador abierto) esperan."""

    def __init__(self) -> None:
        self._condition = threading.Condition()
        self._frames: dict[str, tuple[int, bytes]] = {}

    def publish(self, camera_id: str, jpeg: bytes) -> None:
        with self._condition:
            seq = self._frames.get(camera_id, (0, b""))[0] + 1
            self._frames[camera_id] = (seq, jpeg)
            self._condition.notify_all()

    def latest(self, camera_id: str) -> bytes | None:
        with self._condition:
            frame = self._frames.get(camera_id)
            return frame[1] if frame else None

    def wait_next(self, camera_id: str, last_seq: int, timeout: float) -> tuple[int, bytes] | None:
        """Devuelve (seq, jpeg) del primer fotograma posterior a last_seq, o None si expira el tiempo."""
        with self._condition:
            self._condition.wait_for(
                lambda: self._frames.get(camera_id, (0, b""))[0] > last_seq, timeout=timeout
            )
            frame = self._frames.get(camera_id)
            return frame if frame and frame[0] > last_seq else None
