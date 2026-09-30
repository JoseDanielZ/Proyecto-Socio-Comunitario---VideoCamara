from __future__ import annotations

from dataclasses import dataclass

from ...domain.entities.ticket import Ticket
from ...domain.entities.user import User
from ...domain.errors import NotFoundError, ValidationError
from ...domain.repositories.ports import TicketFilter, TicketRepository, UserRepository
from ...domain.value_objects.enums import TicketCategory, TicketPriority, TicketStatus
from ..ports import Clock, utc_now


@dataclass(frozen=True)
class NewTicket:
    title: str
    description: str
    category: TicketCategory = TicketCategory.OTHER
    priority: TicketPriority = TicketPriority.MEDIUM
    location: str | None = None
    reporter_name: str | None = None
    reporter_contact: str | None = None


@dataclass(frozen=True)
class TicketPage:
    items: list[Ticket]
    total: int


class TicketService:
    def __init__(self, tickets: TicketRepository, users: UserRepository, clock: Clock = utc_now):
        self._tickets = tickets
        self._users = users
        self._clock = clock

    def create(self, author: User, data: NewTicket) -> Ticket:
        ticket = Ticket(
            code="",  # lo asigna el repositorio (TCK-0001, correlativo)
            title=data.title.strip(),
            description=data.description.strip(),
            category=data.category,
            priority=data.priority,
            created_by=author.id,
            created_at=self._clock(),
            location=(data.location or "").strip() or None,
            reporter_name=(data.reporter_name or "").strip() or None,
            reporter_contact=(data.reporter_contact or "").strip() or None,
        )
        ticket.record_creation()
        return self._tickets.add(ticket)

    def get(self, ticket_id: int) -> Ticket:
        ticket = self._tickets.get(ticket_id)
        if ticket is None:
            raise NotFoundError("Ticket no encontrado")
        return ticket

    def list(self, criteria: TicketFilter) -> TicketPage:
        return TicketPage(self._tickets.search(criteria), self._tickets.count(criteria))

    def change_status(self, ticket_id: int, status: TicketStatus, author: User) -> Ticket:
        ticket = self.get(ticket_id)
        ticket.change_status(status, author.id, self._clock())
        return self._tickets.save(ticket)

    def assign(self, ticket_id: int, assignee_id: int | None, author: User) -> Ticket:
        ticket = self.get(ticket_id)
        if assignee_id is not None:
            assignee = self._users.get(assignee_id)
            if assignee is None or not assignee.is_active:
                raise ValidationError("La persona asignada no existe o está inactiva")
        ticket.assign(assignee_id, author.id, self._clock())
        return self._tickets.save(ticket)

    def add_comment(self, ticket_id: int, body: str, author: User) -> Ticket:
        ticket = self.get(ticket_id)
        ticket.add_comment(body, author.id, self._clock())
        return self._tickets.save(ticket)

    def counts_by_status(self) -> dict[TicketStatus, int]:
        counts = self._tickets.counts_by_status()
        return {status: counts.get(status, 0) for status in TicketStatus}
