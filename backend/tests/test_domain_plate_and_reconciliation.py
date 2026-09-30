from datetime import timedelta

import pytest

from app.domain.errors import ValidationError
from app.domain.services.reconciliation import reconcile, unmatched_events
from app.domain.entities.visit import Visit
from app.domain.value_objects.enums import MatchStatus, VehicleType, VisitType
from app.domain.value_objects.plate import Plate, levenshtein

from conftest import T0, make_event

MOTO = VehicleType.MOTORCYCLE


# ------------------------------------------------------------------- placas
def test_plate_is_normalized():
    assert Plate.parse(" ab-123c ").value == "AB123C"
    assert Plate.parse("abc 1234").value == "ABC1234"


def test_empty_plate_is_none():
    assert Plate.parse(None) is None
    assert Plate.parse("  - ") is None


@pytest.mark.parametrize("raw", ["AB", "ABCDEFGHIJKL"])
def test_invalid_length_is_rejected(raw):
    with pytest.raises(ValidationError):
        Plate.parse(raw)


def test_try_parse_treats_garbage_as_no_plate():
    assert Plate.try_parse("??") is None
    assert Plate.try_parse("ABC1234").value == "ABC1234"


def test_levenshtein():
    assert levenshtein("ABC1234", "ABC1234") == 0
    assert levenshtein("ABC1234", "ABC1284") == 1
    assert levenshtein("ABC1234", "ABC12") == 2


def test_similarity_tolerates_one_error_and_ocr_confusions():
    plate = Plate("ABC1234")
    assert plate.similar_to(Plate("ABC1284"))  # un carácter distinto
    assert plate.similar_to(Plate("A8C1234"))  # B leída como 8
    assert plate.similar_to(Plate("ABCI234"))  # 1 leído como I
    assert not plate.similar_to(Plate("XYZ9999"))
    assert not plate.similar_to(Plate("ABC1299"))  # dos errores reales


# -------------------------------------------------------------- conciliación
def test_verified_when_same_plate_in_window():
    event = make_event(T0 - timedelta(minutes=2), plate="AB123C", id=1)
    result = reconcile(plate=Plate("AB123C"), vehicle_type=MOTO, at=T0, events=[event])
    assert result.status == MatchStatus.VERIFIED
    assert result.event is event


def test_verified_with_one_misread_character():
    event = make_event(T0, plate="AB128C", id=1)
    result = reconcile(plate=Plate("AB123C"), vehicle_type=MOTO, at=T0, events=[event])
    assert result.status == MatchStatus.VERIFIED


def test_picks_closest_event_in_time():
    far = make_event(T0 - timedelta(minutes=8), plate="AB123C", id=1)
    near = make_event(T0 - timedelta(minutes=1), plate="AB123C", id=2)
    result = reconcile(plate=Plate("AB123C"), vehicle_type=MOTO, at=T0, events=[far, near])
    assert result.event is near


def test_possible_when_same_type_but_plate_unreadable():
    event = make_event(T0 - timedelta(minutes=1), plate=None, id=7)
    result = reconcile(plate=Plate("AB123C"), vehicle_type=MOTO, at=T0, events=[event])
    assert result.status == MatchStatus.POSSIBLE
    assert result.event.id == 7


def test_possible_when_guard_gave_no_plate_but_type_matches():
    event = make_event(T0, plate=None, id=3)
    result = reconcile(plate=None, vehicle_type=MOTO, at=T0, events=[event])
    assert result.status == MatchStatus.POSSIBLE


def test_unreadable_ocr_garbage_counts_as_no_plate():
    event = make_event(T0, plate="??", id=3)
    result = reconcile(plate=Plate("AB123C"), vehicle_type=MOTO, at=T0, events=[event])
    assert result.status == MatchStatus.POSSIBLE


def test_no_evidence_when_nothing_in_window():
    event = make_event(T0 - timedelta(minutes=30), plate="AB123C", id=1)
    result = reconcile(plate=Plate("AB123C"), vehicle_type=MOTO, at=T0, events=[event])
    assert result.status == MatchStatus.NO_CAMERA_EVIDENCE
    assert result.event is None


def test_no_evidence_when_camera_saw_other_plate():
    event = make_event(T0, plate="ZZZ9999", vehicle_type=VehicleType.CAR, id=1)
    result = reconcile(plate=Plate("AB123C"), vehicle_type=MOTO, at=T0, events=[event])
    assert result.status == MatchStatus.NO_CAMERA_EVIDENCE
    assert "ZZZ9999" in result.reason


def test_different_vehicle_type_without_plate_is_not_a_match():
    event = make_event(T0, plate=None, vehicle_type=VehicleType.CAR, id=1)
    result = reconcile(plate=Plate("AB123C"), vehicle_type=MOTO, at=T0, events=[event])
    assert result.status == MatchStatus.NO_CAMERA_EVIDENCE


def test_reason_says_which_types_the_camera_saw_when_no_plates_involved():
    car = make_event(T0, plate=None, vehicle_type=VehicleType.CAR, id=1)
    result = reconcile(plate=Plate("AB123C"), vehicle_type=MOTO, at=T0, events=[car])
    assert "car" in result.reason and "otra placa" not in result.reason


def test_on_foot_visit_is_not_applicable():
    result = reconcile(plate=None, vehicle_type=None, at=T0, events=[make_event(T0)])
    assert result.status == MatchStatus.NOT_APPLICABLE


def test_window_boundary_is_inclusive():
    event = make_event(T0 - timedelta(minutes=10), plate="AB123C", id=1)
    assert reconcile(plate=Plate("AB123C"), vehicle_type=MOTO, at=T0, events=[event]).status == (
        MatchStatus.VERIFIED
    )
    late = make_event(T0 - timedelta(minutes=10, seconds=1), plate="AB123C", id=2)
    assert reconcile(plate=Plate("AB123C"), vehicle_type=MOTO, at=T0, events=[late]).status == (
        MatchStatus.NO_CAMERA_EVIDENCE
    )


# ------------------------------------------------------ no registrados
def _visit(at, plate=None, vehicle_type=MOTO, camera_event_id=None) -> Visit:
    return Visit(
        VisitType.DELIVERY, "Repartidor", at, registered_by=1,
        plate=Plate.parse(plate), vehicle_type=vehicle_type, camera_event_id=camera_event_id,
    )


def test_unmatched_events_lists_vehicles_nobody_registered():
    registered = make_event(T0, plate="AB123C", id=1)
    ghost = make_event(T0 + timedelta(minutes=30), plate="ZZ999Z", id=2)
    result = unmatched_events([registered, ghost], [_visit(T0, "AB123C")])
    assert [e.id for e in result] == [2]


def test_event_linked_by_confirmation_is_explained():
    event = make_event(T0 + timedelta(minutes=40), plate=None, id=5)
    visit = _visit(T0, "AB123C", camera_event_id=5)
    assert unmatched_events([event], [visit]) == []
