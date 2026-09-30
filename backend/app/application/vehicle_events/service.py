from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import datetime

from ...domain.entities.vehicle_event import VehicleEvent
from ...domain.errors import NotFoundError
from ...domain.repositories.ports import VehicleEventFilter, VehicleEventRepository


@dataclass(frozen=True)
class VehicleEventPage:
    items: list[VehicleEvent]
    total: int


@dataclass(frozen=True)
class VehicleEventSummary:
    total: int
    by_type: dict[str, int]
    by_color: dict[str, int]
    by_hour: dict[int, int]  # hora del día (0-23, UTC) -> cantidad


class VehicleEventService:
    def __init__(self, events: VehicleEventRepository):
        self._events = events

    def record(self, event: VehicleEvent) -> VehicleEvent:
        """Lo llama el worker de cámara cada vez que un vehículo cruza la línea."""
        return self._events.add(event)

    def get(self, event_id: int) -> VehicleEvent:
        event = self._events.get(event_id)
        if event is None:
            raise NotFoundError("Evento de cámara no encontrado")
        return event

    def list(self, criteria: VehicleEventFilter) -> VehicleEventPage:
        return VehicleEventPage(self._events.search(criteria), self._events.count(criteria))

    def summary(self, start: datetime, end: datetime) -> VehicleEventSummary:
        events = self._events.between(start, end)
        return VehicleEventSummary(
            total=len(events),
            by_type=dict(Counter(e.vehicle_type.value for e in events)),
            by_color=dict(Counter(e.color or "desconocido" for e in events)),
            by_hour=dict(sorted(Counter(e.occurred_at.hour for e in events).items())),
        )
