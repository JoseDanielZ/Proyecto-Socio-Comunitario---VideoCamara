from __future__ import annotations

import numpy as np
import supervision as sv

from .line_zone import LineZoneManager


class DebugAnnotator:
    """Dibuja cajas, IDs de tracking y las líneas de entrada/salida sobre el
    frame. Solo se usa en modo --preview; no se ejecuta en despliegue headless."""

    def __init__(self, line_zones: LineZoneManager):
        self._box_annotator = sv.BoxAnnotator()
        self._label_annotator = sv.LabelAnnotator()
        self._zones = line_zones.zones()
        self._line_annotators = [sv.LineZoneAnnotator() for _ in self._zones]

    def annotate(self, frame: np.ndarray, detections: sv.Detections) -> np.ndarray:
        count = len(detections)
        tracker_ids = detections.tracker_id if detections.tracker_id is not None else [None] * count
        confidences = detections.confidence if detections.confidence is not None else [0.0] * count
        labels = [
            f"#{tid} {conf:.2f}" if tid is not None else f"{conf:.2f}"
            for tid, conf in zip(tracker_ids, confidences)
        ]

        annotated = self._box_annotator.annotate(scene=frame.copy(), detections=detections)
        annotated = self._label_annotator.annotate(
            scene=annotated, detections=detections, labels=labels
        )
        for zone, annotator in zip(self._zones, self._line_annotators):
            annotated = annotator.annotate(frame=annotated, line_counter=zone)
        return annotated
