"""Implementaciones SQLAlchemy de los puertos del dominio.

Cada método abre una sesión corta: es seguro usarlos desde varios hilos (el worker de
cámara escribe eventos mientras la API atiende peticiones)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload, sessionmaker

from ...domain.entities.ticket import Ticket, TicketEntry
from ...domain.entities.user import User
from ...domain.entities.vehicle_event import VehicleEvent
from ...domain.entities.visit import Visit
from ...domain.repositories.ports import (
    TicketFilter,
    TicketRepository,
    UserRepository,
    VehicleEventFilter,
    VehicleEventRepository,
    VisitFilter,
    VisitRepository,
)
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
from ...domain.value_objects.plate import Plate
from .models import TicketEntryRow, TicketRow, UserRow, VehicleEventRow, VisitRow


def _like(text: str) -> str:
    return f"%{text.strip()}%"


# ------------------------------------------------------------------ usuarios
def _user(row: UserRow) -> User:
    return User(row.username, row.full_name, Role(row.role), row.password_hash, row.is_active, row.id)


class SqlUserRepository(UserRepository):
    def __init__(self, session_factory: sessionmaker[Session]):
        self._sf = session_factory

    def add(self, user: User) -> User:
        row = UserRow(
            username=user.username,
            full_name=user.full_name,
            role=user.role.value,
            password_hash=user.password_hash,
            is_active=user.is_active,
        )
        with self._sf() as s:
            s.add(row)
            s.commit()
            return _user(row)

    def get(self, user_id: int) -> User | None:
        with self._sf() as s:
            row = s.get(UserRow, user_id)
            return _user(row) if row else None

    def get_by_username(self, username: str) -> User | None:
        with self._sf() as s:
            row = s.scalar(select(UserRow).where(UserRow.username == username))
            return _user(row) if row else None

    def list(self) -> list[User]:
        with self._sf() as s:
            return [_user(r) for r in s.scalars(select(UserRow).order_by(UserRow.id))]

    def update(self, user: User) -> User:
        with self._sf() as s:
            row = s.get(UserRow, user.id)
            row.full_name, row.role = user.full_name, user.role.value
            row.password_hash, row.is_active = user.password_hash, user.is_active
            s.commit()
            return _user(row)


# ------------------------------------------------------------ eventos de cámara
def _event(row: VehicleEventRow) -> VehicleEvent:
    return VehicleEvent(
        camera_id=row.camera_id,
        occurred_at=row.occurred_at,
        vehicle_type=VehicleType(row.vehicle_type),
        color=row.color,
        plate_text=row.plate_text,
        plate_confidence=row.plate_confidence,
        direction=row.direction,
        tracker_id=row.tracker_id,
        snapshot_path=row.snapshot_path,
        id=row.id,
    )


def _event_conditions(c: VehicleEventFilter) -> list:
    conditions = []
    if c.start:
        conditions.append(VehicleEventRow.occurred_at >= c.start)
    if c.end:
        conditions.append(VehicleEventRow.occurred_at <= c.end)
    if c.plate:
        conditions.append(VehicleEventRow.plate_text.ilike(_like(c.plate)))
    if c.vehicle_type:
        conditions.append(VehicleEventRow.vehicle_type == c.vehicle_type.value)
    if c.color:
        conditions.append(VehicleEventRow.color == c.color)
    return conditions


class SqlVehicleEventRepository(VehicleEventRepository):
    def __init__(self, session_factory: sessionmaker[Session]):
        self._sf = session_factory

    def add(self, event: VehicleEvent) -> VehicleEvent:
        row = VehicleEventRow(
            camera_id=event.camera_id,
            occurred_at=event.occurred_at,
            vehicle_type=event.vehicle_type.value,
            color=event.color,
            plate_text=event.plate_text,
            plate_confidence=event.plate_confidence,
            direction=event.direction,
            tracker_id=event.tracker_id,
            snapshot_path=event.snapshot_path,
        )
        with self._sf() as s:
            s.add(row)
            s.commit()
            return _event(row)

    def get(self, event_id: int) -> VehicleEvent | None:
        with self._sf() as s:
            row = s.get(VehicleEventRow, event_id)
            return _event(row) if row else None

    def search(self, criteria: VehicleEventFilter) -> list[VehicleEvent]:
        query = (
            select(VehicleEventRow)
            .where(*_event_conditions(criteria))
            .order_by(VehicleEventRow.occurred_at.desc(), VehicleEventRow.id.desc())
            .limit(criteria.limit)
            .offset(criteria.offset)
        )
        with self._sf() as s:
            return [_event(r) for r in s.scalars(query)]

    def count(self, criteria: VehicleEventFilter) -> int:
        with self._sf() as s:
            return s.scalar(
                select(func.count()).select_from(VehicleEventRow).where(*_event_conditions(criteria))
            )

    def between(self, start: datetime, end: datetime) -> list[VehicleEvent]:
        query = (
            select(VehicleEventRow)
            .where(VehicleEventRow.occurred_at >= start, VehicleEventRow.occurred_at <= end)
            .order_by(VehicleEventRow.occurred_at, VehicleEventRow.id)
        )
        with self._sf() as s:
            return [_event(r) for r in s.scalars(query)]


# ---------------------------------------------------------------------- visitas
def _visit(row: VisitRow) -> Visit:
    return Visit(
        visit_type=VisitType(row.visit_type),
        full_name=row.full_name,
        entered_at=row.entered_at,
        registered_by=row.registered_by,
        document_id=row.document_id,
        company=row.company,
        plate=Plate(row.plate) if row.plate else None,
        vehicle_type=VehicleType(row.vehicle_type) if row.vehicle_type else None,
        destination=row.destination,
        host_name=row.host_name,
        notes=row.notes,
        exited_at=row.exited_at,
        camera_event_id=row.camera_event_id,
        match_status=MatchStatus(row.match_status),
        id=row.id,
    )


def _visit_conditions(c: VisitFilter) -> list:
    conditions = []
    if c.active_only is True:
        conditions.append(VisitRow.exited_at.is_(None))
    elif c.active_only is False:
        conditions.append(VisitRow.exited_at.is_not(None))
    if c.visit_type:
        conditions.append(VisitRow.visit_type == c.visit_type.value)
    if c.start:
        conditions.append(VisitRow.entered_at >= c.start)
    if c.end:
        conditions.append(VisitRow.entered_at <= c.end)
    if c.search:
        like = _like(c.search)
        conditions.append(
            or_(
                VisitRow.full_name.ilike(like),
                VisitRow.plate.ilike(like),
                VisitRow.company.ilike(like),
                VisitRow.destination.ilike(like),
            )
        )
    return conditions


class SqlVisitRepository(VisitRepository):
    def __init__(self, session_factory: sessionmaker[Session]):
        self._sf = session_factory

    @staticmethod
    def _fill(row: VisitRow, visit: Visit) -> None:
        row.visit_type = visit.visit_type.value
        row.full_name = visit.full_name
        row.document_id = visit.document_id
        row.company = visit.company
        row.plate = visit.plate.value if visit.plate else None
        row.vehicle_type = visit.vehicle_type.value if visit.vehicle_type else None
        row.destination = visit.destination
        row.host_name = visit.host_name
        row.notes = visit.notes
        row.entered_at = visit.entered_at
        row.exited_at = visit.exited_at
        row.registered_by = visit.registered_by
        row.camera_event_id = visit.camera_event_id
        row.match_status = visit.match_status.value

    def add(self, visit: Visit) -> Visit:
        row = VisitRow()
        self._fill(row, visit)
        with self._sf() as s:
            s.add(row)
            s.commit()
            return _visit(row)

    def get(self, visit_id: int) -> Visit | None:
        with self._sf() as s:
            row = s.get(VisitRow, visit_id)
            return _visit(row) if row else None

    def update(self, visit: Visit) -> Visit:
        with self._sf() as s:
            row = s.get(VisitRow, visit.id)
            self._fill(row, visit)
            s.commit()
            return _visit(row)

    def search(self, criteria: VisitFilter) -> list[Visit]:
        query = (
            select(VisitRow)
            .where(*_visit_conditions(criteria))
            .order_by(VisitRow.entered_at.desc(), VisitRow.id.desc())
            .limit(criteria.limit)
            .offset(criteria.offset)
        )
        with self._sf() as s:
            return [_visit(r) for r in s.scalars(query)]

    def count(self, criteria: VisitFilter) -> int:
        with self._sf() as s:
            return s.scalar(
                select(func.count()).select_from(VisitRow).where(*_visit_conditions(criteria))
            )

    def with_vehicle_between(self, start: datetime, end: datetime) -> list[Visit]:
        query = select(VisitRow).where(
            VisitRow.entered_at >= start,
            VisitRow.entered_at <= end,
            or_(VisitRow.plate.is_not(None), VisitRow.vehicle_type.is_not(None)),
        )
        with self._sf() as s:
            return [_visit(r) for r in s.scalars(query)]


# ---------------------------------------------------------------------- tickets
def _entry(row: TicketEntryRow) -> TicketEntry:
    return TicketEntry(
        kind=TicketEntryKind(row.kind),
        author_id=row.author_id,
        created_at=row.created_at,
        body=row.body,
        from_status=TicketStatus(row.from_status) if row.from_status else None,
        to_status=TicketStatus(row.to_status) if row.to_status else None,
        id=row.id,
    )


def _ticket(row: TicketRow) -> Ticket:
    return Ticket(
        code=row.code,
        title=row.title,
        description=row.description,
        category=TicketCategory(row.category),
        priority=TicketPriority(row.priority),
        created_by=row.created_by,
        created_at=row.created_at,
        location=row.location,
        reporter_name=row.reporter_name,
        reporter_contact=row.reporter_contact,
        status=TicketStatus(row.status),
        assigned_to=row.assigned_to,
        updated_at=row.updated_at,
        resolved_at=row.resolved_at,
        entries=[_entry(e) for e in row.entries],
        id=row.id,
    )


def _entry_row(entry: TicketEntry) -> TicketEntryRow:
    return TicketEntryRow(
        kind=entry.kind.value,
        author_id=entry.author_id,
        created_at=entry.created_at,
        body=entry.body,
        from_status=entry.from_status.value if entry.from_status else None,
        to_status=entry.to_status.value if entry.to_status else None,
    )


def _ticket_conditions(c: TicketFilter) -> list:
    conditions = []
    if c.status:
        conditions.append(TicketRow.status == c.status.value)
    if c.category:
        conditions.append(TicketRow.category == c.category.value)
    if c.priority:
        conditions.append(TicketRow.priority == c.priority.value)
    if c.assigned_to is not None:
        conditions.append(TicketRow.assigned_to == c.assigned_to)
    if c.search:
        like = _like(c.search)
        conditions.append(
            or_(TicketRow.code.ilike(like), TicketRow.title.ilike(like), TicketRow.location.ilike(like))
        )
    return conditions


class SqlTicketRepository(TicketRepository):
    def __init__(self, session_factory: sessionmaker[Session]):
        self._sf = session_factory

    def add(self, ticket: Ticket) -> Ticket:
        row = TicketRow(
            code=f"TMP-{uuid.uuid4().hex}",  # se reemplaza por TCK-000N al conocer el id
            title=ticket.title,
            description=ticket.description,
            category=ticket.category.value,
            priority=ticket.priority.value,
            status=ticket.status.value,
            location=ticket.location,
            reporter_name=ticket.reporter_name,
            reporter_contact=ticket.reporter_contact,
            created_by=ticket.created_by,
            assigned_to=ticket.assigned_to,
            created_at=ticket.created_at,
            updated_at=ticket.updated_at,
            resolved_at=ticket.resolved_at,
            entries=[_entry_row(e) for e in ticket.entries],
        )
        with self._sf() as s:
            s.add(row)
            s.flush()
            row.code = f"TCK-{row.id:04d}"
            s.commit()
            return _ticket(row)

    def get(self, ticket_id: int) -> Ticket | None:
        with self._sf() as s:
            row = s.scalar(
                select(TicketRow).options(joinedload(TicketRow.entries)).where(TicketRow.id == ticket_id)
            )
            return _ticket(row) if row else None

    def save(self, ticket: Ticket) -> Ticket:
        with self._sf() as s:
            row = s.scalar(
                select(TicketRow).options(joinedload(TicketRow.entries)).where(TicketRow.id == ticket.id)
            )
            row.status = ticket.status.value
            row.assigned_to = ticket.assigned_to
            row.updated_at = ticket.updated_at
            row.resolved_at = ticket.resolved_at
            row.entries.extend(_entry_row(e) for e in ticket.entries if e.id is None)
            s.commit()
            return _ticket(row)

    def search(self, criteria: TicketFilter) -> list[Ticket]:
        query = (
            select(TicketRow)
            .options(joinedload(TicketRow.entries))
            .where(*_ticket_conditions(criteria))
            .order_by(TicketRow.updated_at.desc(), TicketRow.id.desc())
            .limit(criteria.limit)
            .offset(criteria.offset)
        )
        with self._sf() as s:
            return [_ticket(r) for r in s.scalars(query).unique()]

    def count(self, criteria: TicketFilter) -> int:
        with self._sf() as s:
            return s.scalar(
                select(func.count()).select_from(TicketRow).where(*_ticket_conditions(criteria))
            )

    def counts_by_status(self) -> dict[TicketStatus, int]:
        with self._sf() as s:
            rows = s.execute(select(TicketRow.status, func.count()).group_by(TicketRow.status))
            return {TicketStatus(status): total for status, total in rows}
