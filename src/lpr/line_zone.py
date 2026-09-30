from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import supervision as sv

from .config import LineZoneConfig


@dataclass
class CrossingEvent:
    detection_index: int
    direction: str
    line_name: str


class LineZoneManager:
    """Envuelve una o más sv.LineZone y traduce los cruces detectados a
    las etiquetas entrada/salida configuradas para cada línea."""

    def __init__(self, configs: list[LineZoneConfig]):
        self._entries = [
            (
                cfg,
                sv.LineZone(
                    start=sv.Point(*cfg.start),
                    end=sv.Point(*cfg.end),
                    # Cuenta cuando el centro del vehículo cruza; con las 4
                    # esquinas (default) un vehículo largo tarda en contarse.
                    triggering_anchors=[sv.Position.CENTER],
                ),
            )
            for cfg in configs
        ]

    def trigger(self, detections: sv.Detections) -> list[CrossingEvent]:
        events: list[CrossingEvent] = []
        for cfg, zone in self._entries:
            crossed_in, crossed_out = zone.trigger(detections)
            for idx in np.where(crossed_in)[0]:
                events.append(CrossingEvent(int(idx), cfg.in_label, cfg.name))
            for idx in np.where(crossed_out)[0]:
                events.append(CrossingEvent(int(idx), cfg.out_label, cfg.name))
        return events

    def zones(self) -> list[sv.LineZone]:
        return [zone for _, zone in self._entries]
