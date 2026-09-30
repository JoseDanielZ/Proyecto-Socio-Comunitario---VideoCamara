from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.application.auth.service import AuthService
from app.application.cameras.service import CameraGateway, CameraInfo
from app.config import Settings
from app.main import create_app
from app.application.tickets.service import TicketService
from app.application.vehicle_events.service import VehicleEventService
from app.application.visits.service import VisitService
from app.domain.entities.user import User
from app.domain.entities.vehicle_event import VehicleEvent
from app.domain.value_objects.enums import Role, VehicleType
from app.infrastructure.persistence.database import make_engine, make_session_factory
from app.infrastructure.persistence.repositories import (
    SqlTicketRepository,
    SqlUserRepository,
    SqlVehicleEventRepository,
    SqlVisitRepository,
)
from app.infrastructure.security.adapters import BcryptPasswordHasher, JwtTokenService

T0 = datetime(2026, 9, 29, 14, 0, tzinfo=timezone.utc)


class FakeClock:
    """Reloj controlable para probar ventanas de tiempo sin esperar."""

    def __init__(self, now: datetime = T0):
        self.now = now

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **kwargs) -> None:
        self.now += timedelta(**kwargs)


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def session_factory():
    return make_session_factory(make_engine("sqlite://"))


@pytest.fixture
def repos(session_factory):
    return {
        "users": SqlUserRepository(session_factory),
        "events": SqlVehicleEventRepository(session_factory),
        "visits": SqlVisitRepository(session_factory),
        "tickets": SqlTicketRepository(session_factory),
    }


@pytest.fixture
def auth(repos) -> AuthService:
    return AuthService(repos["users"], BcryptPasswordHasher(), JwtTokenService("test-secret-test-secret-test-secret-32"))


@pytest.fixture
def admin(auth) -> User:
    return auth.create_user("admin", "Administrador", Role.ADMIN, "admin123")


@pytest.fixture
def guard(auth) -> User:
    return auth.create_user("guardia1", "Guardia Uno", Role.GUARD, "guard123")


@pytest.fixture
def tickets(repos, clock) -> TicketService:
    return TicketService(repos["tickets"], repos["users"], clock)


@pytest.fixture
def visits(repos, clock) -> VisitService:
    return VisitService(repos["visits"], repos["events"], clock)


@pytest.fixture
def events(repos) -> VehicleEventService:
    return VehicleEventService(repos["events"])


def make_event(
    at: datetime = T0,
    vehicle_type: VehicleType = VehicleType.MOTORCYCLE,
    plate: str | None = None,
    color: str | None = "negro",
    **kwargs,
) -> VehicleEvent:
    return VehicleEvent(
        camera_id="entrada",
        occurred_at=at,
        vehicle_type=vehicle_type,
        color=color,
        plate_text=plate,
        **kwargs,
    )


JPEG = b"\xff\xd8\xff\xe0fake-jpeg\xff\xd9"


class FakeCameraGateway(CameraGateway):
    def list_cameras(self) -> list[CameraInfo]:
        return [CameraInfo("entrada", "Entrada principal", "running", crossings=3)]

    def latest_jpeg(self, camera_id: str) -> bytes | None:
        return JPEG

    def stream_jpegs(self, camera_id: str) -> Iterator[bytes]:
        return iter([JPEG, JPEG])


def make_settings(tmp_path: Path) -> Settings:
    return Settings(
        database_url="sqlite://",
        jwt_secret="test-secret-test-secret-test-secret-32",
        jwt_expires_minutes=60,
        cors_origins=("http://localhost:5173",),
        local_utc_offset_hours=-5,
        camera_enabled=False,
        camera_id="entrada",
        camera_name="Entrada principal",
        lpr_config_path=tmp_path / "config.yaml",
        snapshots_dir=tmp_path / "snapshots",
        camera_loop=False,
        camera_realtime=False,
        camera_jpeg_quality=70,
    )


@pytest.fixture
def app(tmp_path):
    return create_app(make_settings(tmp_path), FakeCameraGateway())


@pytest.fixture
def container(app):
    return app.state.container


@pytest.fixture
def client(app):
    return TestClient(app)
