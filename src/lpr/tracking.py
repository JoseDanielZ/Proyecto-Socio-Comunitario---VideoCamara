from __future__ import annotations

import supervision as sv


def create_tracker(frame_rate: float = 25.0) -> sv.ByteTrack:
    """Crea el tracker que asigna un tracker_id persistente por vehículo,
    evitando contar el mismo vehículo dos veces al cruzar la línea."""
    return sv.ByteTrack(frame_rate=max(1, round(frame_rate)))
