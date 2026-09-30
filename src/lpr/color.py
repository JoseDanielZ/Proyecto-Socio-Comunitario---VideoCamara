from __future__ import annotations

from collections import Counter

import cv2
import numpy as np

# Rangos de matiz de OpenCV (H va de 0 a 179). Orden: (límite superior, nombre).
_HUE_BINS = [
    (8, "rojo"),
    (15, "naranja"),
    (35, "amarillo"),
    (85, "verde"),
    (100, "celeste"),
    (130, "azul"),
    (155, "morado"),
    (165, "rosado"),
    (180, "rojo"),
]

_REGION_FRACTION = 0.8  # se descartan los bordes de la caja (asfalto, sombras)
_MIN_SATURATION_FOR_HUE = 60
_MIN_VALUE_FOR_HUE = 50
# Con techo panorámico o vidrios grandes, el color de la pintura puede ser solo
# una parte del vehículo: basta ese porcentaje de píxeles con matiz para decidir.
_MIN_CHROMATIC_FRACTION = 0.25
_MIN_ACHROMATIC_FRACTION = 0.25
_WHITE_MIN_VALUE = 170
_LIGHT_GRAY_MIN_VALUE = 110  # gris plateado; por debajo es gris oscuro/negro
_BLACK_MAX_VALUE = 55
_UNKNOWN = "desconocido"


def _central_region(crop: np.ndarray, fraction: float = _REGION_FRACTION) -> np.ndarray:
    h, w = crop.shape[:2]
    dy = int(h * (1 - fraction) / 2)
    dx = int(w * (1 - fraction) / 2)
    return crop[dy : h - dy, dx : w - dx]


def classify_vehicle_color(crop: np.ndarray) -> str:
    """Devuelve el color dominante (en español) de un recorte BGR de vehículo.

    Reglas por prioridad, pensadas para vista aérea (donde vidrios, sombras y
    asfalto son oscuros en todos los vehículos):
      1. Si al menos el 25 % de los píxeles tiene matiz, gana el matiz dominante.
      2. Si no, blanco si hay suficientes píxeles muy claros; luego gris plateado.
      3. Si nada de eso, gris oscuro o negro según predomine.
    """
    if crop is None or crop.size == 0:
        return _UNKNOWN
    region = _central_region(crop)
    if region.size == 0:
        return _UNKNOWN

    hsv = cv2.cvtColor(region, cv2.COLOR_BGR2HSV).reshape(-1, 3)
    hue, sat, val = hsv[:, 0], hsv[:, 1], hsv[:, 2]
    total = len(hsv)

    chromatic = (sat >= _MIN_SATURATION_FOR_HUE) & (val >= _MIN_VALUE_FOR_HUE)
    hue_votes: Counter[str] = Counter()
    lower = 0
    for upper, name in _HUE_BINS:
        hue_votes[name] += int((chromatic & (hue >= lower) & (hue < upper)).sum())
        lower = upper
    hue_name, hue_count = hue_votes.most_common(1)[0]
    if hue_count / total >= _MIN_CHROMATIC_FRACTION:
        return hue_name

    achromatic = ~chromatic
    if (achromatic & (val >= _WHITE_MIN_VALUE)).sum() / total >= _MIN_ACHROMATIC_FRACTION:
        return "blanco"
    light = achromatic & (val >= _LIGHT_GRAY_MIN_VALUE) & (val < _WHITE_MIN_VALUE)
    if light.sum() / total >= _MIN_ACHROMATIC_FRACTION:
        return "gris"

    mid = int((achromatic & (val >= _BLACK_MAX_VALUE) & (val < _LIGHT_GRAY_MIN_VALUE)).sum())
    dark = int((achromatic & (val < _BLACK_MAX_VALUE)).sum())
    return "gris" if mid > dark else "negro"
