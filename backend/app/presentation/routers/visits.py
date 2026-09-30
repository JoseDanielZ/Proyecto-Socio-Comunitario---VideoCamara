from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from ...application.visits.service import NewVisit
from ...container import Container
from ...domain.entities.user import User
from ...domain.repositories.ports import VisitFilter
from ...domain.value_objects.enums import VehicleType, VisitType
from ..deps import any_staff, get_container
from ..schemas.dto import (
    ConfirmEventIn,
    VehicleEventOut,
    VisitCreate,
    VisitOut,
    VisitPageOut,
    VisitWithMatchOut,
)

router = APIRouter(prefix="/visits", tags=["Visitas, deliveries y proveedores"])


@router.post("", response_model=VisitWithMatchOut, status_code=201)
def register_entry(
    body: VisitCreate, user: User = Depends(any_staff), container: Container = Depends(get_container)
) -> VisitWithMatchOut:
    """Registra el ingreso y lo compara al instante con lo que vieron las cámaras."""
    return VisitWithMatchOut.of(container.visits.register_entry(user, NewVisit(**body.model_dump())))


@router.get("", response_model=VisitPageOut)
def list_visits(
    active: bool | None = Query(default=None, description="true = dentro del conjunto, false = ya salieron"),
    visit_type: VisitType | None = Query(default=None, alias="type"),
    date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
    q: str | None = Query(default=None, max_length=100, description="nombre, placa, empresa o destino"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(any_staff),
    container: Container = Depends(get_container),
) -> VisitPageOut:
    page = container.visits.list(VisitFilter(active, visit_type, date_from, date_to, q, limit, offset))
    return VisitPageOut(items=[VisitOut.of(v) for v in page.items], total=page.total)


# Esta ruta va antes de "/{visit_id}" para que "unmatched-vehicles" no se interprete como id.
@router.get("/unmatched-vehicles", response_model=list[VehicleEventOut])
def unmatched_vehicles(
    hours: int = Query(default=2, ge=1, le=72, description="ventana hacia atrás desde ahora"),
    vehicle_type: VehicleType | None = Query(default=VehicleType.MOTORCYCLE, alias="type"),
    _: User = Depends(any_staff),
    container: Container = Depends(get_container),
) -> list[VehicleEventOut]:
    """Vehículos que la cámara vio cruzar y ningún guardia registró (por defecto, motos)."""
    end = datetime.now(timezone.utc)
    events = container.visits.unmatched_vehicles(end - timedelta(hours=hours), end, vehicle_type)
    return [VehicleEventOut.of(e) for e in reversed(events)]


@router.get("/{visit_id}", response_model=VisitOut)
def get_visit(
    visit_id: int, _: User = Depends(any_staff), container: Container = Depends(get_container)
) -> VisitOut:
    return VisitOut.of(container.visits.get(visit_id))


@router.patch("/{visit_id}/exit", response_model=VisitOut)
def register_exit(
    visit_id: int, _: User = Depends(any_staff), container: Container = Depends(get_container)
) -> VisitOut:
    return VisitOut.of(container.visits.register_exit(visit_id))


@router.get("/{visit_id}/camera-match", response_model=VisitWithMatchOut)
def camera_match(
    visit_id: int, _: User = Depends(any_staff), container: Container = Depends(get_container)
) -> VisitWithMatchOut:
    """Vuelve a comparar con las cámaras (útil si el vehículo se procesó después del registro)."""
    return VisitWithMatchOut.of(container.visits.camera_match(visit_id))


@router.post("/{visit_id}/confirm-camera-event", response_model=VisitWithMatchOut)
def confirm_camera_event(
    visit_id: int,
    body: ConfirmEventIn,
    _: User = Depends(any_staff),
    container: Container = Depends(get_container),
) -> VisitWithMatchOut:
    """El guardia confirma, mirando la foto, que ese evento de cámara es esta visita."""
    return VisitWithMatchOut.of(container.visits.confirm_camera_event(visit_id, body.event_id))
