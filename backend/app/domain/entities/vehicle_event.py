from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from ..value_objects.enums import VehicleType


@dataclass
class VehicleEvent:
    """Un vehículo que cruzó la línea de una cámara."""

    camera_id: str
    occurred_at: datetime
    vehicle_type: VehicleType
    color: str | None = None
    plate_text: str | None = None
    plate_confidence: float | None = None
    direction: str | None = None
    tracker_id: int | None = None
    snapshot_path: str | None = None
    id: int | None = None
