from __future__ import annotations

import numpy as np


def crop_vehicle(frame: np.ndarray, xyxy: np.ndarray, padding: int = 10) -> np.ndarray:
    """Recorta la región del vehículo del frame completo, con un margen para
    no cortar la placa si queda cerca del borde del bounding box."""
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = xyxy.astype(int)
    x1 = max(0, x1 - padding)
    y1 = max(0, y1 - padding)
    x2 = min(w, x2 + padding)
    y2 = min(h, y2 + padding)
    return frame[y1:y2, x1:x2]
