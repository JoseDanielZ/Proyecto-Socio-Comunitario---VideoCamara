from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ...application.tickets.service import NewTicket
from ...container import Container
from ...domain.entities.ticket import Ticket
from ...domain.entities.user import User
from ...domain.repositories.ports import TicketFilter
from ...domain.value_objects.enums import TicketCategory, TicketPriority, TicketStatus
from ..deps import admin_only, any_staff, get_container
from ..schemas.dto import (
    AssignIn,
    CommentIn,
    StatusIn,
    TicketCreate,
    TicketOut,
    TicketPageOut,
    TicketStatsOut,
)

router = APIRouter(prefix="/tickets", tags=["Tickets"])


def _names(container: Container) -> dict[int, str]:
    return {u.id: u.full_name for u in container.auth.list_users()}


def _out(container: Container, ticket: Ticket) -> TicketOut:
    return TicketOut.of(ticket, _names(container))


@router.post("", response_model=TicketOut, status_code=201)
def create_ticket(
    body: TicketCreate, user: User = Depends(any_staff), container: Container = Depends(get_container)
) -> TicketOut:
    ticket = container.tickets.create(user, NewTicket(**body.model_dump()))
    return _out(container, ticket)


@router.get("", response_model=TicketPageOut)
def list_tickets(
    status: TicketStatus | None = None,
    category: TicketCategory | None = None,
    priority: TicketPriority | None = None,
    assigned_to: int | None = None,
    q: str | None = Query(default=None, max_length=100, description="código, título o ubicación"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(any_staff),
    container: Container = Depends(get_container),
) -> TicketPageOut:
    page = container.tickets.list(
        TicketFilter(status, category, priority, assigned_to, q, limit, offset)
    )
    names = _names(container)
    return TicketPageOut(items=[TicketOut.of(t, names) for t in page.items], total=page.total)


@router.get("/stats", response_model=TicketStatsOut)
def ticket_stats(
    _: User = Depends(any_staff), container: Container = Depends(get_container)
) -> TicketStatsOut:
    return TicketStatsOut(by_status=container.tickets.counts_by_status())


@router.get("/{ticket_id}", response_model=TicketOut)
def get_ticket(
    ticket_id: int, _: User = Depends(any_staff), container: Container = Depends(get_container)
) -> TicketOut:
    return _out(container, container.tickets.get(ticket_id))


@router.patch("/{ticket_id}/status", response_model=TicketOut)
def change_status(
    ticket_id: int,
    body: StatusIn,
    user: User = Depends(admin_only),
    container: Container = Depends(get_container),
) -> TicketOut:
    return _out(container, container.tickets.change_status(ticket_id, body.status, user))


@router.patch("/{ticket_id}/assign", response_model=TicketOut)
def assign_ticket(
    ticket_id: int,
    body: AssignIn,
    user: User = Depends(admin_only),
    container: Container = Depends(get_container),
) -> TicketOut:
    return _out(container, container.tickets.assign(ticket_id, body.assignee_id, user))


@router.post("/{ticket_id}/comments", response_model=TicketOut, status_code=201)
def add_comment(
    ticket_id: int,
    body: CommentIn,
    user: User = Depends(any_staff),
    container: Container = Depends(get_container),
) -> TicketOut:
    return _out(container, container.tickets.add_comment(ticket_id, body.body, user))
