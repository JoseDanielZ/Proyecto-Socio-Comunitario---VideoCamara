import numpy as np
import supervision as sv

from lpr.config import LineZoneConfig
from lpr.line_zone import LineZoneManager


def _make_detection(x: float, y: float, tracker_id: int) -> sv.Detections:
    return sv.Detections(
        xyxy=np.array([[x - 10, y - 10, x + 10, y + 10]], dtype=np.float32),
        confidence=np.array([0.9], dtype=np.float32),
        class_id=np.array([2]),
        tracker_id=np.array([tracker_id]),
    )


def test_line_zone_detects_single_crossing():
    config = LineZoneConfig(
        name="linea_test",
        start=(0, 100),
        end=(200, 100),
        in_label="entrada",
        out_label="salida",
    )
    manager = LineZoneManager([config])

    # El vehículo empieza arriba de la línea (y=50) y cruza hacia abajo (y=150).
    manager.trigger(_make_detection(x=100, y=50, tracker_id=1))
    events = manager.trigger(_make_detection(x=100, y=150, tracker_id=1))

    assert len(events) == 1
    assert events[0].direction in ("entrada", "salida")
    assert events[0].line_name == "linea_test"


def test_line_zone_no_duplicate_on_repeated_trigger():
    config = LineZoneConfig(name="linea_test", start=(0, 100), end=(200, 100))
    manager = LineZoneManager([config])

    manager.trigger(_make_detection(x=100, y=50, tracker_id=1))
    first = manager.trigger(_make_detection(x=100, y=150, tracker_id=1))
    # Repetir el mismo cruce sin más movimiento no debe volver a dispararlo.
    second = manager.trigger(_make_detection(x=100, y=150, tracker_id=1))

    assert len(first) == 1
    assert len(second) == 0


def test_line_zone_no_crossing_when_no_movement():
    config = LineZoneConfig(name="linea_test", start=(0, 100), end=(200, 100))
    manager = LineZoneManager([config])

    manager.trigger(_make_detection(x=100, y=50, tracker_id=1))
    events = manager.trigger(_make_detection(x=105, y=55, tracker_id=1))

    assert events == []
