from __future__ import annotations

from typing import Optional, Protocol

import numpy as np


class PlateOCR(Protocol):
    def read(self, vehicle_crop: np.ndarray) -> tuple[Optional[str], Optional[float]]:
        """Recibe el recorte del vehículo y devuelve (texto_placa, confianza),
        o (None, None) si no se pudo leer la placa."""
        ...


class FastAlprOCR:
    """Motor de placa por defecto: detección + OCR combinados vía fast-alpr.

    Los nombres de campo de fast_alpr (result.ocr.text / .confidence) se
    acceden de forma defensiva porque la librería es reciente y su API
    puede cambiar entre versiones; verificar contra la versión instalada
    si la lectura de placas deja de funcionar.
    """

    def __init__(
        self,
        detector_model: Optional[str] = None,
        ocr_model: Optional[str] = None,
    ):
        from fast_alpr import ALPR

        kwargs = {}
        if detector_model:
            kwargs["detector_model"] = detector_model
        if ocr_model:
            kwargs["ocr_model"] = ocr_model
        self._alpr = ALPR(**kwargs)

    def read(self, vehicle_crop: np.ndarray) -> tuple[Optional[str], Optional[float]]:
        if vehicle_crop.size == 0:
            return None, None

        results = self._alpr.predict(vehicle_crop)
        if not results:
            return None, None

        def _confidence(result) -> float:
            ocr = getattr(result, "ocr", None)
            return getattr(ocr, "confidence", 0.0) if ocr else 0.0

        best = max(results, key=_confidence)
        ocr = getattr(best, "ocr", None)
        if ocr is None:
            return None, None
        return getattr(ocr, "text", None), getattr(ocr, "confidence", None)
