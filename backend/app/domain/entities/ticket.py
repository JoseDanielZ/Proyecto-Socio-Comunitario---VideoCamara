from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from ..errors import ConflictError, InvalidTransitionError, ValidationError
from ..value_objects.enums import TicketCategory, TicketEntryKind, TicketPriority, TicketStatus

ALLOWED_TRANSITIONS: dict[TicketStatus, frozenset[TicketStatus]] = {
    TicketStatus.OPEN: frozenset({TicketStatus.IN_PROGRESS, TicketStatus.CLOSED}),
    TicketStatus.IN_PROGRESS: frozenset(
        {TicketStatus.OPEN, TicketStatus.RESOLVED, TicketStatus.CLOSED}
    ),
    TicketStatus.RESOLVED: frozenset({TicketStatus.IN_PROGRESS, TicketStatus.CLOSED}),
    TicketStatus.CLOSED: frozenset(),
}


@dataclass
class TicketEntry:
    """Línea del historial: creación, comentario, cambio de estado o asignación."""

    kind: TicketEntryKind
    author_id: int
    created_at: datetime
    body: str | None = None
    from_status: TicketStatus | None = None
    to_status: TicketStatus | None = None
    id: int | None = None


@dataclass
class Ticket:
    code: str
    title: str
    description: str
    category: TicketCategory
    priority: TicketPriority
    created_by: int
    created_at: datetime
    location: str | None = None  # casa, torre, área común...
    reporter_name: str | None = None  # quien reportó (por el chat, en persona)
    reporter_contact: str | None = None
    status: TicketStatus = TicketStatus.OPEN
    assigned_to: int | None = None
    updated_at: datetime | None = None
    resolved_at: datetime | None = None
    entries: list[TicketEntry] = field(default_factory=list)
    id: int | None = None

    def __post_init__(self) -> None:
        if not self.title.strip():
            raise ValidationError("El título del ticket es obligatorio")
        if self.updated_at is None:
            self.updated_at = self.created_at

    def record_creation(self) -> None:
        self.entries.append(
            TicketEntry(TicketEntryKind.CREATED, self.created_by, self.created_at, self.description)
        )

    def change_status(self, new_status: TicketStatus, author_id: int, at: datetime) -> None:
        if new_status == self.status:
            raise InvalidTransitionError(f"El ticket ya está en estado '{self.status}'")
        if new_status not in ALLOWED_TRANSITIONS[self.status]:
            raise InvalidTransitionError(f"No se puede pasar de '{self.status}' a '{new_status}'")
        self.entries.append(
            TicketEntry(
                TicketEntryKind.STATUS_CHANGE,
                author_id,
                at,
                from_status=self.status,
                to_status=new_status,
            )
        )
        self.status = new_status
        self.resolved_at = at if new_status == TicketStatus.RESOLVED else None
        self.updated_at = at

    def assign(self, user_id: int | None, author_id: int, at: datetime) -> None:
        if self.status == TicketStatus.CLOSED:
            raise ConflictError("No se puede asignar un ticket cerrado")
        self.assigned_to = user_id
        self.entries.append(
            TicketEntry(TicketEntryKind.ASSIGNMENT, author_id, at, str(user_id) if user_id else None)
        )
        self.updated_at = at

    def add_comment(self, body: str, author_id: int, at: datetime) -> None:
        if not body.strip():
            raise ValidationError("El comentario no puede estar vacío")
        if self.status == TicketStatus.CLOSED:
            raise ConflictError("No se puede comentar un ticket cerrado")
        self.entries.append(TicketEntry(TicketEntryKind.COMMENT, author_id, at, body.strip()))
        self.updated_at = at
