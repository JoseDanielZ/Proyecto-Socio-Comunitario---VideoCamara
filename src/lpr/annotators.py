from __future__ import annotations

from collections import Counter

import cv2
import numpy as np
import supervision as sv

from .line_zone import LineZoneManager


class DebugAnnotator:
    """Dibuja cajas, IDs de tracking, tipo/color del vehículo, su estela de
    movimiento, las líneas de conteo y un panel con los cruces acumulados.
    Solo se usa en modo --preview/--output; no se ejecuta en despliegue headless."""

    def __init__(self, line_zones: LineZoneManager):
        self._box_annotator = sv.BoxAnnotator(thickness=3)
        self._label_annotator = sv.LabelAnnotator(text_scale=0.7, text_thickness=2)
        self._trace_annotator = sv.TraceAnnotator(trace_length=60, thickness=3)
        self._zones = line_zones.zones()
        self._line_annotators = [sv.LineZoneAnnotator() for _ in self._zones]

    def annotate(
        self,
        frame: np.ndarray,
        detections: sv.Detections,
        crossings: list[dict] | None = None,
    ) -> np.ndarray:
        count = len(detections)
        tracker_ids = detections.tracker_id if detections.tracker_id is not None else [None] * count
        confidences = detections.confidence if detections.confidence is not None else [0.0] * count
        colors = detections.data.get("color", ["?"] * count)
        types = detections.data.get("vehicle_type", ["vehiculo"] * count)
        labels = [
            f"#{tid} {vtype} {color} {conf:.2f}" if tid is not None else f"{vtype} {color} {conf:.2f}"
            for tid, vtype, color, conf in zip(tracker_ids, types, colors, confidences)
        ]

        annotated = self._trace_annotator.annotate(scene=frame.copy(), detections=detections)
        annotated = self._box_annotator.annotate(scene=annotated, detections=detections)
        annotated = self._label_annotator.annotate(
            scene=annotated, detections=detections, labels=labels
        )
        for zone, annotator in zip(self._zones, self._line_annotators):
            annotated = annotator.annotate(frame=annotated, line_counter=zone)
        if crossings is not None:
            self._draw_panel(annotated, crossings)
        return annotated

    @staticmethod
    def _draw_panel(image: np.ndarray, crossings: list[dict]) -> None:
        by_type = Counter(c["vehicle_type"] for c in crossings)
        by_color = Counter(c["color"] for c in crossings)
        lines = [
            f"Cruzaron la linea: {len(crossings)}",
            "Tipo: " + (", ".join(f"{k} {v}" for k, v in by_type.most_common()) or "-"),
            "Color: " + (", ".join(f"{k} {v}" for k, v in by_color.most_common()) or "-"),
        ]
        font, scale, thickness, pad = cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2, 10
        sizes = [cv2.getTextSize(t, font, scale, thickness)[0] for t in lines]
        width = max(w for w, _ in sizes) + 2 * pad
        line_h = max(h for _, h in sizes) + 10
        height = line_h * len(lines) + pad
        x0, y0 = 10, image.shape[0] - height - 10
        overlay = image.copy()
        cv2.rectangle(overlay, (x0, y0), (x0 + width, y0 + height), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.6, image, 0.4, 0, dst=image)
        for i, text in enumerate(lines):
            y = y0 + pad + line_h * (i + 1) - 10
            cv2.putText(image, text, (x0 + pad, y), font, scale, (255, 255, 255), thickness, cv2.LINE_AA)
