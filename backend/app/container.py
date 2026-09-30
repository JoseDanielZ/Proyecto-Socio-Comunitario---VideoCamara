"""Raíz de composición: único lugar que conoce capas internas y externas a la vez."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

from .application.auth.service import AuthService
from .application.cameras.service import CameraGateway, CameraInfo, CameraService
from .application.tickets.service import TicketService
from .application.vehicle_events.service import VehicleEventService
from .application.visits.service import VisitService
from .config import Settings
from .infrastructure.persistence.database import make_engine, make_session_factory
from .infrastructure.persistence.repositories import (
    SqlTicketRepository,
    SqlUserRepository,
    SqlVehicleEventRepository,
    SqlVisitRepository,
)
from .infrastructure.security.adapters import BcryptPasswordHasher, JwtTokenService


class DisabledCameraGateway(CameraGateway):
    """Se usa cuando CAMERA_ENABLED=false (p. ej. al probar solo tickets y visitas)."""

    def __init__(self, camera_id: str, name: str):
        self._info = CameraInfo(camera_id, name, "disabled", "Cámara deshabilitada en la configuración")

    def list_cameras(self) -> list[CameraInfo]:
        return [self._info]

    def latest_jpeg(self, camera_id: str) -> bytes | None:
        return None

    def stream_jpegs(self, camera_id: str) -> Iterator[bytes]:
        return iter(())


@dataclass
class Container:
    settings: Settings
    auth: AuthService
    tickets: TicketService
    visits: VisitService
    events: VehicleEventService
    cameras: CameraService
    camera_runtime: object | None = None  # tiene start()/stop() si hay motor de visión real


def build_container(settings: Settings, camera_gateway: CameraGateway | None = None) -> Container:
    session_factory = make_session_factory(make_engine(settings.database_url))
    users = SqlUserRepository(session_factory)
    events = SqlVehicleEventRepository(session_factory)
    visits = SqlVisitRepository(session_factory)
    tickets = SqlTicketRepository(session_factory)

    event_service = VehicleEventService(events)
    runtime = None
    if camera_gateway is None:
        if settings.camera_enabled:
            # Import diferido: cargar el motor de visión (torch, ultralytics) es lento y
            # solo se necesita cuando hay una cámara real.
            from .infrastructure.camera.runtime import LprCameraRuntime

            runtime = camera_gateway = LprCameraRuntime(settings, event_service)
        else:
            camera_gateway = DisabledCameraGateway(settings.camera_id, settings.camera_name)

    return Container(
        settings=settings,
        auth=AuthService(users, BcryptPasswordHasher(), JwtTokenService(settings.jwt_secret, settings.jwt_expires_minutes)),
        tickets=TicketService(tickets, users),
        visits=VisitService(visits, events),
        events=event_service,
        cameras=CameraService(camera_gateway),
        camera_runtime=runtime,
    )
