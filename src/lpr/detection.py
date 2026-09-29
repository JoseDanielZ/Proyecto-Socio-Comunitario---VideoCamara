from __future__ import annotations

import numpy as np
import supervision as sv
from ultralytics import YOLO

# Clases COCO relevantes para el conteo de entrada/salida vehicular.
COCO_VEHICLE_CLASS_IDS = {
    "car": 2,
    "motorcycle": 3,
    "bus": 5,
    "truck": 7,
}


class VehicleDetector:
    def __init__(
        self,
        weights_path: str,
        vehicle_classes: list[str],
        confidence_threshold: float = 0.4,
        nms_threshold: float = 0.5,
    ):
        unknown = set(vehicle_classes) - set(COCO_VEHICLE_CLASS_IDS)
        if unknown:
            raise ValueError(f"Clases de vehículo desconocidas en config: {unknown}")

        self._model = YOLO(weights_path)
        self._class_ids = np.array(
            [COCO_VEHICLE_CLASS_IDS[name] for name in vehicle_classes]
        )
        self._confidence_threshold = confidence_threshold
        self._nms_threshold = nms_threshold

    def detect(self, frame: np.ndarray) -> sv.Detections:
        results = self._model(frame, verbose=False, conf=self._confidence_threshold)[0]
        detections = sv.Detections.from_ultralytics(results)
        detections = detections[np.isin(detections.class_id, self._class_ids)]
        detections = detections.with_nms(threshold=self._nms_threshold)
        return detections
