import pytest

from lpr.detection import resolve_class_ids

GEOTRAX_NAMES = {0: "Car", 1: "Bus", 2: "Truck", 3: "Motorcycle", 4: "Pedestrian", 5: "Bicycle"}
COCO_NAMES = {0: "person", 2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}


def test_resolves_by_name_ignoring_case():
    assert resolve_class_ids(GEOTRAX_NAMES, ["car", "bus"]) == {0: "car", 1: "bus"}


def test_same_config_works_with_coco_ids():
    assert resolve_class_ids(COCO_NAMES, ["car", "bus", "truck", "motorcycle"]) == {
        2: "car",
        5: "bus",
        7: "truck",
        3: "motorcycle",
    }


def test_excludes_unrequested_classes():
    assert 4 not in resolve_class_ids(GEOTRAX_NAMES, ["car", "bus", "truck", "motorcycle"])


def test_unknown_class_lists_available_ones():
    with pytest.raises(ValueError, match="van"):
        resolve_class_ids(GEOTRAX_NAMES, ["car", "van"])
