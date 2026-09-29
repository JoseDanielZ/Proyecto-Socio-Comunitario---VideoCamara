from __future__ import annotations

from trackers import ByteTrackTracker


def create_tracker(frame_rate: float = 25.0) -> ByteTrackTracker:
    """Crea el tracker que asigna un tracker_id persistente por vehículo,
    evitando contar el mismo vehículo dos veces al cruzar la línea.

    Usa el paquete `trackers` (no `sv.ByteTrack`, deprecado en supervision
    desde 0.28.0 y eliminado en 0.31.0). A diferencia del tracker anterior,
    `ByteTrackTracker.update()` devuelve TODAS las detecciones, incluidas
    las aún no confirmadas con tracker_id = -1 — deben filtrarse antes de
    usarlas en line_zone/pipeline (ver Pipeline.process)."""
    return ByteTrackTracker(frame_rate=max(1.0, frame_rate))
