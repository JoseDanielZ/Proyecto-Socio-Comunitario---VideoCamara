from __future__ import annotations

import numpy as np
import supervision as sv
from ultralytics import YOLO


def resolve_class_ids(model_names: dict[int, str], wanted: list[str]) -> dict[int, str]:
    """Mapea los nombres de clase pedidos en config a los ids del modelo
    (comparando sin distinguir mayúsculas), devolviendo {id: nombre en minúsculas}.

    Cada modelo trae sus propios ids (COCO: car=2; geo-trax: Car=0), así que
    se resuelven por nombre en vez de fijar ids."""
    by_name = {name.lower(): class_id for class_id, name in model_names.items()}
    unknown = {name.lower() for name in wanted} - set(by_name)
    if unknown:
        raise ValueError(
            f"Clases de vehículo {sorted(unknown)} no existen en el modelo; "
            f"clases disponibles: {sorted(by_name)}"
        )
    return {by_name[name.lower()]: name.lower() for name in wanted}


class VehicleDetector:
    def __init__(
        self,
        weights_path: str,
        vehicle_classes: list[str],
        confidence_threshold: float = 0.4,
        nms_threshold: float = 0.5,
        imgsz: int = 640,
    ):
        self._model = YOLO(weights_path)
        self._class_names = resolve_class_ids(self._model.names, vehicle_classes)
        self._class_ids = np.array(list(self._class_names))
        self._confidence_threshold = confidence_threshold
        self._nms_threshold = nms_threshold
        self._imgsz = imgsz

    @property
    def class_names(self) -> dict[int, str]:
        """{class_id del modelo: nombre del tipo de vehículo}."""
        return self._class_names

    def detect(self, frame: np.ndarray) -> sv.Detections:
        results = self._model(
            frame, verbose=False, conf=self._confidence_threshold, imgsz=self._imgsz
        )[0]
        detections = sv.Detections.from_ultralytics(results)
        detections = detections[np.isin(detections.class_id, self._class_ids)]
        detections = detections.with_nms(
            threshold=self._nms_threshold, class_agnostic=True
        )
        return detections
