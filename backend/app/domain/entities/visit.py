from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from ..value_objects.enums import MatchStatus, VehicleType, VisitType
from ..value_objects.plate import Plate


@dataclass
class Visit:
    """Ingreso registrado por un guardia: visitante, delivery o proveedor."""

    visit_type: VisitType
    full_name: str
    entered_at: datetime
    registered_by: int
    document_id: str | None = None
    company: str | None = None  # Uber, PedidosYa, empresa proveedora...
    plate: Plate | None = None
    vehicle_type: VehicleType | None = None
    destination: str | None = None  # casa / departamento visitado
    host_name: str | None = None
    notes: str | None = None
    exited_at: datetime | None = None
    camera_event_id: int | None = None  # evento de cámara que respalda el ingreso
    match_status: MatchStatus = MatchStatus.NOT_APPLICABLE
    id: int | None = None

    @property
    def is_active(self) -> bool:
        return self.exited_at is None

    @property
    def has_vehicle(self) -> bool:
        return self.plate is not None or self.vehicle_type is not None
