"""DTOs de la API REST: forma exacta de las peticiones y respuestas JSON (la 'vista' del MVC)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from ...application.cameras.service import CameraInfo
from ...application.visits.service import VisitWithMatch
from ...domain.entities.ticket import Ticket, TicketEntry
from ...domain.entities.user import User
from ...domain.entities.vehicle_event import VehicleEvent
from ...domain.entities.visit import Visit
from ...domain.services.reconciliation import MatchResult
from ...domain.value_objects.enums import (
    MatchStatus,
    Role,
    TicketCategory,
    TicketEntryKind,
    TicketPriority,
    TicketStatus,
    VehicleType,
    VisitType,
)


class Schema(BaseModel):
    model_config = ConfigDict(use_enum_values=False)


# -------------------------------------------------------------------- auth / usuarios
class LoginIn(Schema):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=200)


class UserOut(Schema):
    id: int
    username: str
    full_name: str
    role: Role
    is_active: bool

    @classmethod
    def of(cls, user: User) -> "UserOut":
        return cls(
            id=user.id, username=user.username, full_name=user.full_name,
            role=user.role, is_active=user.is_active,
        )


class TokenOut(Schema):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserCreate(Schema):
    username: str = Field(min_length=3, max_length=50)
    full_name: str = Field(min_length=1, max_length=120)
    role: Role
    password: str = Field(min_length=6, max_length=200)


class UserUpdate(Schema):
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    role: Role | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=6, max_length=200)


# ---------------------------------------------------------------- eventos de cámara
class VehicleEventOut(Schema):
    id: int
    camera_id: str
    occurred_at: datetime
    vehicle_type: VehicleType
    color: str | None
    plate_text: str | None
    plate_confidence: float | None
    direction: str | None
    snapshot_url: str | None  # requiere ?access_token=... si se usa en <img>

    @classmethod
    def of(cls, e: VehicleEvent) -> "VehicleEventOut":
        return cls(
            id=e.id, camera_id=e.camera_id, occurred_at=e.occurred_at, vehicle_type=e.vehicle_type,
            color=e.color, plate_text=e.plate_text, plate_confidence=e.plate_confidence,
            direction=e.direction,
            snapshot_url=f"/api/vehicle-events/{e.id}/snapshot" if e.snapshot_path else None,
        )


class VehicleEventPageOut(Schema):
    items: list[VehicleEventOut]
    total: int


class VehicleEventSummaryOut(Schema):
    total: int
    by_type: dict[str, int]
    by_color: dict[str, int]
    by_hour: dict[int, int]


class CameraOut(Schema):
    id: str
    name: str
    status: str
    detail: str | None
    crossings: int

    @classmethod
    def of(cls, c: CameraInfo) -> "CameraOut":
        return cls(id=c.id, name=c.name, status=c.status, detail=c.detail, crossings=c.crossings)


# ------------------------------------------------------------------------- visitas
class VisitCreate(Schema):
    visit_type: VisitType
    full_name: str = Field(min_length=1, max_length=120)
    document_id: str | None = Field(default=None, max_length=30)
    company: str | None = Field(default=None, max_length=80)
    plate: str | None = Field(default=None, max_length=20)
    vehicle_type: VehicleType | None = None
    destination: str | None = Field(default=None, max_length=120)
    host_name: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)


class CameraMatchOut(Schema):
    status: MatchStatus
    reason: str
    event: VehicleEventOut | None

    @classmethod
    def of(cls, m: MatchResult) -> "CameraMatchOut":
        return cls(status=m.status, reason=m.reason, event=VehicleEventOut.of(m.event) if m.event else None)


class VisitOut(Schema):
    id: int
    visit_type: VisitType
    full_name: str
    document_id: str | None
    company: str | None
    plate: str | None
    vehicle_type: VehicleType | None
    destination: str | None
    host_name: str | None
    notes: str | None
    entered_at: datetime
    exited_at: datetime | None
    is_active: bool
    registered_by: int
    camera_event_id: int | None
    match_status: MatchStatus

    @classmethod
    def of(cls, v: Visit) -> "VisitOut":
        return cls(
            id=v.id, visit_type=v.visit_type, full_name=v.full_name, document_id=v.document_id,
            company=v.company, plate=v.plate.value if v.plate else None, vehicle_type=v.vehicle_type,
            destination=v.destination, host_name=v.host_name, notes=v.notes,
            entered_at=v.entered_at, exited_at=v.exited_at, is_active=v.is_active,
            registered_by=v.registered_by, camera_event_id=v.camera_event_id,
            match_status=v.match_status,
        )


class VisitWithMatchOut(Schema):
    visit: VisitOut
    camera_match: CameraMatchOut

    @classmethod
    def of(cls, r: VisitWithMatch) -> "VisitWithMatchOut":
        return cls(visit=VisitOut.of(r.visit), camera_match=CameraMatchOut.of(r.match))


class VisitPageOut(Schema):
    items: list[VisitOut]
    total: int


class ConfirmEventIn(Schema):
    event_id: int


# ------------------------------------------------------------------------- tickets
class TicketCreate(Schema):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=4000)
    category: TicketCategory = TicketCategory.OTHER
    priority: TicketPriority = TicketPriority.MEDIUM
    location: str | None = Field(default=None, max_length=120)
    reporter_name: str | None = Field(default=None, max_length=120)
    reporter_contact: str | None = Field(default=None, max_length=80)


class StatusIn(Schema):
    status: TicketStatus


class AssignIn(Schema):
    assignee_id: int | None


class CommentIn(Schema):
    body: str = Field(min_length=1, max_length=2000)


class TicketEntryOut(Schema):
    id: int
    kind: TicketEntryKind
    author_id: int
    author_name: str
    created_at: datetime
    body: str | None
    from_status: TicketStatus | None
    to_status: TicketStatus | None

    @classmethod
    def of(cls, e: TicketEntry, names: dict[int, str]) -> "TicketEntryOut":
        return cls(
            id=e.id, kind=e.kind, author_id=e.author_id, author_name=names.get(e.author_id, "—"),
            created_at=e.created_at, body=e.body, from_status=e.from_status, to_status=e.to_status,
        )


class TicketOut(Schema):
    id: int
    code: str
    title: str
    description: str
    category: TicketCategory
    priority: TicketPriority
    status: TicketStatus
    location: str | None
    reporter_name: str | None
    reporter_contact: str | None
    created_by: int
    created_by_name: str
    assigned_to: int | None
    assigned_to_name: str | None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    entries: list[TicketEntryOut]

    @classmethod
    def of(cls, t: Ticket, names: dict[int, str]) -> "TicketOut":
        return cls(
            id=t.id, code=t.code, title=t.title, description=t.description, category=t.category,
            priority=t.priority, status=t.status, location=t.location, reporter_name=t.reporter_name,
            reporter_contact=t.reporter_contact, created_by=t.created_by,
            created_by_name=names.get(t.created_by, "—"), assigned_to=t.assigned_to,
            assigned_to_name=names.get(t.assigned_to) if t.assigned_to else None,
            created_at=t.created_at, updated_at=t.updated_at, resolved_at=t.resolved_at,
            entries=[TicketEntryOut.of(e, names) for e in t.entries],
        )


class TicketPageOut(Schema):
    items: list[TicketOut]
    total: int


class TicketStatsOut(Schema):
    by_status: dict[TicketStatus, int]


# ------------------------------------------------------------------------ dashboard
class DashboardOut(Schema):
    vehicles_today: int
    vehicles_today_by_type: dict[str, int]
    active_visits: int
    tickets_by_status: dict[TicketStatus, int]
    unregistered_motorcycles: list[VehicleEventOut]  # vistos por cámara en las últimas 2 h sin registro
    camera: CameraOut | None
