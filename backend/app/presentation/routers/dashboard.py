from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from ...container import Container
from ...domain.entities.user import User
from ...domain.repositories.ports import VisitFilter
from ...domain.value_objects.enums import VehicleType
from ..deps import any_staff, get_container
from ..schemas.dto import CameraOut, DashboardOut, VehicleEventOut

router = APIRouter(tags=["Inicio"])


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(_: User = Depends(any_staff), container: Container = Depends(get_container)) -> DashboardOut:
    now = datetime.now(timezone.utc)
    local = timezone(timedelta(hours=container.settings.local_utc_offset_hours))
    start_of_day = now.astimezone(local).replace(hour=0, minute=0, second=0, microsecond=0)

    today = container.events.summary(start_of_day, now)
    unregistered = container.visits.unmatched_vehicles(
        now - timedelta(hours=2), now, VehicleType.MOTORCYCLE
    )
    cameras = container.cameras.list()
    return DashboardOut(
        vehicles_today=today.total,
        vehicles_today_by_type=today.by_type,
        active_visits=container.visits.list(VisitFilter(active_only=True, limit=1)).total,
        tickets_by_status=container.tickets.counts_by_status(),
        unregistered_motorcycles=[VehicleEventOut.of(e) for e in reversed(unregistered)],
        camera=CameraOut.of(cameras[0]) if cameras else None,
    )
