from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from ...domain.entities.user import User
from ...domain.entities.vehicle_event import VehicleEvent
from ...domain.entities.visit import Visit
from ...domain.errors import ConflictError, NotFoundError, ValidationError
from ...domain.repositories.ports import (
    VehicleEventRepository,
    VisitFilter,
    VisitRepository,
)
from ...domain.services.reconciliation import (
    DEFAULT_WINDOW,
    MatchResult,
    reconcile,
    unmatched_events,
)
from ...domain.value_objects.enums import MatchStatus, VehicleType, VisitType
from ...domain.value_objects.plate import Plate
from ..ports import Clock, utc_now


@dataclass(frozen=True)
class NewVisit:
    visit_type: VisitType
    full_name: str
    document_id: str | None = None
    company: str | None = None
    plate: str | None = None
    vehicle_type: VehicleType | None = None
    destination: str | None = None
    host_name: str | None = None
    notes: str | None = None


@dataclass(frozen=True)
class VisitWithMatch:
    visit: Visit
    match: MatchResult


@dataclass(frozen=True)
class VisitPage:
    items: list[Visit]
    total: int


def _clean(value: str | None) -> str | None:
    return (value or "").strip() or None


class VisitService:
    def __init__(
        self,
        visits: VisitRepository,
        events: VehicleEventRepository,
        clock: Clock = utc_now,
        window: timedelta = DEFAULT_WINDOW,
    ):
        self._visits = visits
        self._events = events
        self._clock = clock
        self._window = window

    # ---- registro -------------------------------------------------------------------
    def register_entry(self, guard: User, data: NewVisit) -> VisitWithMatch:
        full_name = _clean(data.full_name)
        if full_name is None:
            raise ValidationError("El nombre es obligatorio")
        plate = Plate.parse(data.plate)
        # Una placa implica vehículo; si el guardia no dijo cuál, se asume auto.
        vehicle_type = data.vehicle_type or (VehicleType.CAR if plate else None)

        visit = Visit(
            visit_type=data.visit_type,
            full_name=full_name,
            entered_at=self._clock(),
            registered_by=guard.id,
            document_id=_clean(data.document_id),
            company=_clean(data.company),
            plate=plate,
            vehicle_type=vehicle_type,
            destination=_clean(data.destination),
            host_name=_clean(data.host_name),
            notes=_clean(data.notes),
        )
        match = self._reconcile(visit)
        self._apply(visit, match)
        return VisitWithMatch(self._visits.add(visit), match)

    def register_exit(self, visit_id: int) -> Visit:
        visit = self.get(visit_id)
        if not visit.is_active:
            raise ConflictError("Esta visita ya tiene salida registrada")
        visit.exited_at = self._clock()
        return self._visits.update(visit)

    # ---- consulta -------------------------------------------------------------------
    def get(self, visit_id: int) -> Visit:
        visit = self._visits.get(visit_id)
        if visit is None:
            raise NotFoundError("Visita no encontrada")
        return visit

    def list(self, criteria: VisitFilter) -> VisitPage:
        return VisitPage(self._visits.search(criteria), self._visits.count(criteria))

    # ---- conciliación con cámaras ---------------------------------------------------
    def camera_match(self, visit_id: int) -> VisitWithMatch:
        """Vuelve a comparar con las cámaras y guarda el resultado. Sirve cuando la
        cámara procesó el vehículo después de que el guardia lo registró."""
        visit = self.get(visit_id)
        if visit.camera_event_id is not None and visit.match_status == MatchStatus.VERIFIED:
            event = self._events.get(visit.camera_event_id)
            if event is not None:
                return VisitWithMatch(visit, MatchResult(MatchStatus.VERIFIED, event, "Ya se comprobó con la cámara"))
        match = self._reconcile(visit)
        self._apply(visit, match)
        return VisitWithMatch(self._visits.update(visit), match)

    def confirm_camera_event(self, visit_id: int, event_id: int) -> VisitWithMatch:
        """El guardia mira la foto de una coincidencia 'possible' y la confirma."""
        visit = self.get(visit_id)
        event = self._events.get(event_id)
        if event is None:
            raise NotFoundError("Evento de cámara no encontrado")
        visit.camera_event_id = event.id
        visit.match_status = MatchStatus.VERIFIED
        self._visits.update(visit)
        return VisitWithMatch(
            visit, MatchResult(MatchStatus.VERIFIED, event, "Confirmado por el guardia")
        )

    def unmatched_vehicles(
        self, start: datetime, end: datetime, vehicle_type: VehicleType | None = None
    ) -> list[VehicleEvent]:
        """Vehículos que la cámara vio y ningún guardia registró (p. ej. motos de delivery)."""
        events = self._events.between(start, end)
        if vehicle_type is not None:
            events = [e for e in events if e.vehicle_type == vehicle_type]
        visits = self._visits.with_vehicle_between(start - self._window, end + self._window)
        return unmatched_events(events, visits, self._window)

    # ---- internos -------------------------------------------------------------------
    def _reconcile(self, visit: Visit) -> MatchResult:
        events = self._events.between(
            visit.entered_at - self._window, visit.entered_at + self._window
        )
        return reconcile(
            plate=visit.plate,
            vehicle_type=visit.vehicle_type,
            at=visit.entered_at,
            events=events,
            window=self._window,
        )

    @staticmethod
    def _apply(visit: Visit, match: MatchResult) -> None:
        visit.match_status = match.status
        visit.camera_event_id = match.event.id if match.event else None
