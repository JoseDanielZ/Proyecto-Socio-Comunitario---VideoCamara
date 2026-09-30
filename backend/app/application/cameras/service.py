from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterator
from dataclasses import dataclass

from ...domain.errors import NotFoundError


@dataclass(frozen=True)
class CameraInfo:
    id: str
    name: str
    status: str  # running | finished | stopped | error | disabled
    detail: str | None = None
    crossings: int = 0  # cruces contados desde que arrancó


class CameraGateway(ABC):
    """Puerto hacia el motor de visión (infrastructure/camera lo implementa)."""

    @abstractmethod
    def list_cameras(self) -> list[CameraInfo]: ...

    @abstractmethod
    def latest_jpeg(self, camera_id: str) -> bytes | None: ...

    @abstractmethod
    def stream_jpegs(self, camera_id: str) -> Iterator[bytes]:
        """Genera fotogramas JPEG anotados a medida que llegan (bloquea entre fotogramas)."""


class CameraService:
    def __init__(self, gateway: CameraGateway):
        self._gateway = gateway

    def list(self) -> list[CameraInfo]:
        return self._gateway.list_cameras()

    def get(self, camera_id: str) -> CameraInfo:
        for camera in self._gateway.list_cameras():
            if camera.id == camera_id:
                return camera
        raise NotFoundError("Cámara no encontrada")

    def snapshot(self, camera_id: str) -> bytes:
        self.get(camera_id)
        frame = self._gateway.latest_jpeg(camera_id)
        if frame is None:
            raise NotFoundError("La cámara aún no produjo imagen")
        return frame

    def stream(self, camera_id: str) -> Iterator[bytes]:
        self.get(camera_id)
        return self._gateway.stream_jpegs(camera_id)
