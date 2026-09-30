from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import FileResponse, StreamingResponse

from ...container import Container
from ...domain.entities.user import User
from ...domain.errors import NotFoundError
from ...domain.repositories.ports import VehicleEventFilter
from ...domain.value_objects.enums import VehicleType
from ...domain.value_objects.plate import normalize
from ..deps import any_staff, get_container
from ..schemas.dto import (
    CameraOut,
    VehicleEventOut,
    VehicleEventPageOut,
    VehicleEventSummaryOut,
)

router = APIRouter(tags=["Cámaras y accesos vehiculares"])

_BOUNDARY = "frame"


@router.get("/cameras", response_model=list[CameraOut])
def list_cameras(
    _: User = Depends(any_staff), container: Container = Depends(get_container)
) -> list[CameraOut]:
    return [CameraOut.of(c) for c in container.cameras.list()]


@router.get("/cameras/{camera_id}/snapshot.jpg")
def camera_snapshot(
    camera_id: str, _: User = Depends(any_staff), container: Container = Depends(get_container)
) -> Response:
    return Response(
        container.cameras.snapshot(camera_id),
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/cameras/{camera_id}/stream")
def camera_stream(
    camera_id: str, _: User = Depends(any_staff), container: Container = Depends(get_container)
) -> StreamingResponse:
    """Video en vivo con cajas, tipo, color y conteo (MJPEG: se muestra con un <img>)."""
    frames = container.cameras.stream(camera_id)

    def multipart() -> Iterator[bytes]:
        for jpeg in frames:
            yield (
                f"--{_BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: {len(jpeg)}\r\n\r\n"
            ).encode() + jpeg + b"\r\n"

    return StreamingResponse(
        multipart(),
        media_type=f"multipart/x-mixed-replace; boundary={_BOUNDARY}",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/vehicle-events", response_model=VehicleEventPageOut)
def list_vehicle_events(
    date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
    plate: str | None = Query(default=None, max_length=20),
    vehicle_type: VehicleType | None = Query(default=None, alias="type"),
    color: str | None = Query(default=None, max_length=30),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(any_staff),
    container: Container = Depends(get_container),
) -> VehicleEventPageOut:
    page = container.events.list(
        VehicleEventFilter(date_from, date_to, normalize(plate) if plate else None, vehicle_type, color, limit, offset)
    )
    return VehicleEventPageOut(items=[VehicleEventOut.of(e) for e in page.items], total=page.total)


@router.get("/vehicle-events/summary", response_model=VehicleEventSummaryOut)
def vehicle_events_summary(
    date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
    _: User = Depends(any_staff),
    container: Container = Depends(get_container),
) -> VehicleEventSummaryOut:
    end = date_to or datetime.now(timezone.utc)
    start = date_from or end - timedelta(hours=24)
    s = container.events.summary(start, end)
    return VehicleEventSummaryOut(total=s.total, by_type=s.by_type, by_color=s.by_color, by_hour=s.by_hour)


@router.get("/vehicle-events/{event_id}/snapshot")
def vehicle_event_snapshot(
    event_id: int, _: User = Depends(any_staff), container: Container = Depends(get_container)
) -> FileResponse:
    event = container.events.get(event_id)
    if not event.snapshot_path:
        raise NotFoundError("Este evento no tiene foto")
    path = Path(event.snapshot_path).resolve()
    allowed = container.settings.snapshots_dir.resolve()
    if allowed not in path.parents or not path.is_file():  # nunca servir archivos fuera de la carpeta de fotos
        raise NotFoundError("Foto no disponible")
    return FileResponse(path, media_type="image/jpeg")
