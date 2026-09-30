"""Conciliación de visitas con lo que vieron las cámaras (reglas puras, sin I/O)."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from ..entities.vehicle_event import VehicleEvent
from ..entities.visit import Visit
from ..value_objects.enums import MatchStatus, VehicleType
from ..value_objects.plate import Plate

DEFAULT_WINDOW = timedelta(minutes=10)


@dataclass(frozen=True)
class MatchResult:
    status: MatchStatus
    event: VehicleEvent | None
    reason: str


def _closest(events: Iterable[VehicleEvent], at: datetime) -> VehicleEvent:
    return min(events, key=lambda e: abs(e.occurred_at - at))


def reconcile(
    *,
    plate: Plate | None,
    vehicle_type: VehicleType | None,
    at: datetime,
    events: Sequence[VehicleEvent],
    window: timedelta = DEFAULT_WINDOW,
) -> MatchResult:
    """Decide si las cámaras respaldan el ingreso de un vehículo.

    - VERIFIED: hay un evento en la ventana con la misma placa (tolera 1 carácter mal leído).
    - POSSIBLE: no coincide la placa pero hay un evento del mismo tipo con placa ilegible;
      el guardia debe confirmarlo mirando la foto.
    - NO_CAMERA_EVIDENCE: nada en la ventana, o solo vehículos con otra placa legible.
    """
    if plate is None and vehicle_type is None:
        return MatchResult(MatchStatus.NOT_APPLICABLE, None, "Ingreso sin vehículo")

    nearby = [e for e in events if abs(e.occurred_at - at) <= window]
    minutes = int(window.total_seconds() // 60)
    if not nearby:
        return MatchResult(
            MatchStatus.NO_CAMERA_EVIDENCE,
            None,
            f"La cámara no registró ningún vehículo en ±{minutes} min",
        )

    if plate is not None:
        same_plate = [
            e for e in nearby if (seen := Plate.try_parse(e.plate_text)) and seen.similar_to(plate)
        ]
        if same_plate:
            return MatchResult(
                MatchStatus.VERIFIED, _closest(same_plate, at), "La cámara leyó esta placa"
            )

    unreadable_same_type = [
        e
        for e in nearby
        if Plate.try_parse(e.plate_text) is None
        and (vehicle_type is None or e.vehicle_type == vehicle_type)
    ]
    if unreadable_same_type:
        return MatchResult(
            MatchStatus.POSSIBLE,
            _closest(unreadable_same_type, at),
            "La cámara vio un vehículo del mismo tipo pero no pudo leer la placa; confirmar con la foto",
        )

    other_plates = sorted({e.plate_text for e in nearby if e.plate_text})
    if other_plates:
        reason = f"La cámara solo vio vehículos con otra placa (vio: {', '.join(other_plates)})"
    else:
        seen = ", ".join(sorted({e.vehicle_type.value for e in nearby}))
        reason = f"La cámara vio vehículos ({seen}) pero ninguno del tipo registrado"
    return MatchResult(MatchStatus.NO_CAMERA_EVIDENCE, None, reason)


def unmatched_events(
    events: Sequence[VehicleEvent],
    visits: Sequence[Visit],
    window: timedelta = DEFAULT_WINDOW,
) -> list[VehicleEvent]:
    """Vehículos que la cámara vio cruzar y ninguna visita registrada explica."""
    result = []
    for event in events:
        explained = any(
            visit.camera_event_id == event.id
            or reconcile(
                plate=visit.plate,
                vehicle_type=visit.vehicle_type,
                at=visit.entered_at,
                events=[event],
                window=window,
            ).status
            in (MatchStatus.VERIFIED, MatchStatus.POSSIBLE)
            for visit in visits
        )
        if not explained:
            result.append(event)
    return result
