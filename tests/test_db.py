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


def test_vehicle_color_roundtrip(tmp_path: Path):
    repo = EventRepository(tmp_path / "test.db")
    repo.insert(
        Event(
            vehicle_type="car",
            vehicle_color="amarillo",
            direction="entrada",
            source_id="camera_principal",
            timestamp="2026-09-29T10:00:00+00:00",
        )
    )
    assert repo.get_last_events(limit=1)[0]["vehicle_color"] == "amarillo"
    repo.close()


def test_migrates_legacy_db_without_vehicle_color(tmp_path: Path):
    import sqlite3

    db_path = tmp_path / "legacy.db"
    conn = sqlite3.connect(db_path)
    conn.execute(
        """CREATE TABLE events (
            id INTEGER PRIMARY KEY AUTOINCREMENT, plate_text TEXT, plate_confidence REAL,
            vehicle_type TEXT NOT NULL,
            direction TEXT NOT NULL CHECK (direction IN ('entrada', 'salida')),
            tracker_id INTEGER, source_id TEXT NOT NULL, timestamp TEXT NOT NULL,
            snapshot_path TEXT)"""
    )
    conn.commit()
    conn.close()

    repo = EventRepository(db_path)
    repo.insert(
        Event(
            vehicle_type="car",
            vehicle_color="azul",
            direction="salida",
            source_id="camera_principal",
            timestamp="2026-09-29T10:00:00+00:00",
        )
    )
    assert repo.get_last_events(limit=1)[0]["vehicle_color"] == "azul"
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
