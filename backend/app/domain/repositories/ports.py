"""Puertos (interfaces) de persistencia. El dominio depende de ellos; la infraestructura los implementa."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime

from ..entities.ticket import Ticket
from ..entities.user import User
from ..entities.vehicle_event import VehicleEvent
from ..entities.visit import Visit
from ..value_objects.enums import (
    TicketCategory,
    TicketPriority,
    TicketStatus,
    VehicleType,
    VisitType,
)


@dataclass(frozen=True)
class VehicleEventFilter:
    start: datetime | None = None
    end: datetime | None = None
    plate: str | None = None  # coincidencia parcial, ya normalizada
    vehicle_type: VehicleType | None = None
    color: str | None = None
    limit: int = 100
    offset: int = 0


@dataclass(frozen=True)
class VisitFilter:
    active_only: bool | None = None
    visit_type: VisitType | None = None
    start: datetime | None = None  # entered_at >= start
    end: datetime | None = None  # entered_at <= end
    search: str | None = None  # nombre, placa, empresa o destino
    limit: int = 100
    offset: int = 0


@dataclass(frozen=True)
class TicketFilter:
    status: TicketStatus | None = None
    category: TicketCategory | None = None
    priority: TicketPriority | None = None
    assigned_to: int | None = None
    search: str | None = None  # código, título o ubicación
    limit: int = 100
    offset: int = 0


class UserRepository(ABC):
    @abstractmethod
    def add(self, user: User) -> User: ...

    @abstractmethod
    def get(self, user_id: int) -> User | None: ...

    @abstractmethod
    def get_by_username(self, username: str) -> User | None: ...

    @abstractmethod
    def list(self) -> list[User]: ...

    @abstractmethod
    def update(self, user: User) -> User: ...


class VehicleEventRepository(ABC):
    @abstractmethod
    def add(self, event: VehicleEvent) -> VehicleEvent: ...

    @abstractmethod
    def get(self, event_id: int) -> VehicleEvent | None: ...

    @abstractmethod
    def search(self, criteria: VehicleEventFilter) -> list[VehicleEvent]: ...

    @abstractmethod
    def count(self, criteria: VehicleEventFilter) -> int: ...

    @abstractmethod
    def between(self, start: datetime, end: datetime) -> list[VehicleEvent]:
        """Eventos con start <= occurred_at <= end, del más viejo al más nuevo."""


class VisitRepository(ABC):
    @abstractmethod
    def add(self, visit: Visit) -> Visit: ...

    @abstractmethod
    def get(self, visit_id: int) -> Visit | None: ...

    @abstractmethod
    def update(self, visit: Visit) -> Visit: ...

    @abstractmethod
    def search(self, criteria: VisitFilter) -> list[Visit]: ...

    @abstractmethod
    def count(self, criteria: VisitFilter) -> int: ...

    @abstractmethod
    def with_vehicle_between(self, start: datetime, end: datetime) -> list[Visit]:
        """Visitas con vehículo (placa o tipo) cuyo ingreso cae entre start y end."""


class TicketRepository(ABC):
    @abstractmethod
    def add(self, ticket: Ticket) -> Ticket:
        """Asigna id y código correlativo (TCK-0001) al guardar."""

    @abstractmethod
    def get(self, ticket_id: int) -> Ticket | None: ...

    @abstractmethod
    def save(self, ticket: Ticket) -> Ticket:
        """Persiste cambios del ticket y las entradas nuevas de su historial."""

    @abstractmethod
    def search(self, criteria: TicketFilter) -> list[Ticket]: ...

    @abstractmethod
    def count(self, criteria: TicketFilter) -> int: ...

    @abstractmethod
    def counts_by_status(self) -> dict[TicketStatus, int]: ...
