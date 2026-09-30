import numpy as np
import pytest

from lpr.color import classify_vehicle_color


def _solid(bgr: tuple[int, int, int], size: int = 60) -> np.ndarray:
    crop = np.zeros((size, size, 3), dtype=np.uint8)
    crop[:] = bgr
    return crop


@pytest.mark.parametrize(
    "bgr, expected",
    [
        ((0, 0, 220), "rojo"),
        ((0, 200, 240), "amarillo"),
        ((0, 100, 255), "naranja"),
        ((40, 180, 40), "verde"),
        ((220, 180, 40), "celeste"),
        ((180, 60, 20), "azul"),
        ((250, 250, 250), "blanco"),
        ((15, 15, 15), "negro"),
        ((120, 120, 120), "gris"),
    ],
)
def test_solid_colors(bgr, expected):
    assert classify_vehicle_color(_solid(bgr)) == expected


def test_ignores_background_border():
    # Auto amarillo rodeado de asfalto gris oscuro: gana el amarillo del centro.
    crop = _solid((70, 70, 70), size=100)
    crop[25:75, 25:75] = (0, 200, 240)
    assert classify_vehicle_color(crop) == "amarillo"


def test_empty_crop_is_unknown():
    assert classify_vehicle_color(np.zeros((0, 0, 3), dtype=np.uint8)) == "desconocido"


def test_white_vehicle_with_dark_bed_is_white():
    # Camioneta blanca vista desde arriba: cabina blanca + caja oscura.
    crop = _solid((70, 70, 70), size=100)
    crop[25:75, 25:60] = (245, 245, 245)
    crop[25:75, 60:75] = (20, 20, 20)
    assert classify_vehicle_color(crop) == "blanco"


def test_gray_vehicle_with_dark_bed_is_gray():
    crop = _solid((70, 70, 70), size=100)
    crop[25:75, 25:55] = (140, 140, 140)
    crop[25:75, 55:75] = (20, 20, 20)
    assert classify_vehicle_color(crop) == "gris"
