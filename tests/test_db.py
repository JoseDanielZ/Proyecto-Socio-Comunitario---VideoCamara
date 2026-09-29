from pathlib import Path

from lpr.db import Event, EventRepository


def test_insert_and_query_roundtrip(tmp_path: Path):
    db_path = tmp_path / "test.db"
    repo = EventRepository(db_path)

    event = Event(
        vehicle_type="car",
        direction="entrada",
        source_id="camera_principal",
        timestamp="2026-09-29T10:00:00+00:00",
        plate_text="ABC123",
        plate_confidence=0.92,
        tracker_id=1,
    )
    event_id = repo.insert(event)
    assert event_id == 1

    rows = repo.get_last_events(limit=10)
    assert len(rows) == 1
    assert rows[0]["plate_text"] == "ABC123"
    assert rows[0]["direction"] == "entrada"

    plate_rows = repo.get_events_for_plate("ABC123")
    assert len(plate_rows) == 1

    repo.close()


def test_insert_event_without_plate(tmp_path: Path):
    db_path = tmp_path / "test.db"
    repo = EventRepository(db_path)

    event = Event(
        vehicle_type="motorcycle",
        direction="salida",
        source_id="camera_principal",
        timestamp="2026-09-29T10:05:00+00:00",
    )
    repo.insert(event)

    rows = repo.get_last_events(limit=10)
    assert rows[0]["plate_text"] is None

    repo.close()


def test_direction_check_constraint_rejects_invalid_value(tmp_path: Path):
    db_path = tmp_path / "test.db"
    repo = EventRepository(db_path)

    event = Event(
        vehicle_type="car",
        direction="invalida",
        source_id="camera_principal",
        timestamp="2026-09-29T10:10:00+00:00",
    )

    import sqlite3

    try:
        repo.insert(event)
        assert False, "se esperaba sqlite3.IntegrityError por CHECK constraint"
    except sqlite3.IntegrityError:
        pass

    repo.close()
