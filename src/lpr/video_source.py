from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Iterator, Optional

import cv2
import numpy as np

from .config import SourceConfig

logger = logging.getLogger(__name__)


class VideoSourceError(Exception):
    pass


@dataclass
class FrameInfo:
    fps: float
    width: int
    height: int


class VideoSource:
    """Fuente de video unificada: archivo local o stream RTSP.

    El resto del pipeline consume frames() sin importarle el tipo de origen;
    la reconexión ante caídas de RTSP y el loop de archivos de prueba se
    resuelven aquí.
    """

    def __init__(self, config: SourceConfig):
        self._config = config
        self._cap: Optional[cv2.VideoCapture] = None

    def __enter__(self) -> "VideoSource":
        self.open()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def open(self) -> None:
        cap = cv2.VideoCapture(self._config.path_or_url)
        if not cap.isOpened():
            raise VideoSourceError(
                f"No se pudo abrir la fuente de video: {self._config.path_or_url}"
            )
        self._cap = cap

    def close(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None

    @property
    def info(self) -> FrameInfo:
        if self._cap is None:
            raise VideoSourceError("La fuente de video no está abierta")
        fps = self._cap.get(cv2.CAP_PROP_FPS) or 25.0
        width = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        return FrameInfo(fps=fps, width=width, height=height)

    def frames(self) -> Iterator[np.ndarray]:
        if self._cap is None:
            raise VideoSourceError(
                "La fuente de video no está abierta; usar open() o el context manager"
            )

        attempts = 0
        while True:
            ok, frame = self._cap.read()
            if ok:
                attempts = 0
                yield frame
                continue

            if self._config.type == "file":
                if self._config.loop:
                    self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                logger.info("Fin del archivo de video: %s", self._config.path_or_url)
                return

            # RTSP: tratar como caída de stream y reintentar con backoff fijo
            attempts += 1
            if (
                self._config.max_reconnect_attempts >= 0
                and attempts > self._config.max_reconnect_attempts
            ):
                raise VideoSourceError(
                    f"Se agotaron los reintentos de reconexión ({attempts}) para "
                    f"{self._config.path_or_url}"
                )
            logger.warning(
                "Stream RTSP caído (intento %d), reintentando en %.1fs: %s",
                attempts,
                self._config.reconnect_delay_seconds,
                self._config.path_or_url,
            )
            self.close()
            time.sleep(self._config.reconnect_delay_seconds)
            self.open()
