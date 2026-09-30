from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

_SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    plate_text        TEXT,
    plate_confidence  REAL,
    vehicle_type      TEXT NOT NULL,
    vehicle_color     TEXT,
    direction         TEXT NOT NULL CHECK (direction IN ('entrada', 'salida')),
    tracker_id        INTEGER,
    source_id         TEXT NOT NULL,
    timestamp         TEXT NOT NULL,
    snapshot_path     TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_plate ON events(plate_text);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
"""


@dataclass
class Event:
    vehicle_type: str
    direction: str
    source_id: str
    timestamp: str
    plate_text: Optional[str] = None
    plate_confidence: Optional[float] = None
    vehicle_color: Optional[str] = None
    tracker_id: Optional[int] = None
    snapshot_path: Optional[str] = None
    id: Optional[int] = None


class EventRepository:
    def __init__(self, db_path: str | Path):
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.executescript(_SCHEMA)
        self._migrate()
        self._conn.commit()

    def _migrate(self) -> None:
        # Bases creadas antes de existir vehicle_color no la tienen, y
        # CREATE TABLE IF NOT EXISTS no altera tablas existentes.
        columns = {row["name"] for row in self._conn.execute("PRAGMA table_info(events)")}
        if "vehicle_color" not in columns:
            self._conn.execute("ALTER TABLE events ADD COLUMN vehicle_color TEXT")

    def insert(self, event: Event) -> int:
        cursor = self._conn.execute(
            """
            INSERT INTO events (
                plate_text, plate_confidence, vehicle_type, vehicle_color, direction,
                tracker_id, source_id, timestamp, snapshot_path
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event.plate_text,
                event.plate_confidence,
                event.vehicle_type,
                event.vehicle_color,
                event.direction,
                event.tracker_id,
                event.source_id,
                event.timestamp,
                event.snapshot_path,
            ),
        )
        self._conn.commit()
        return cursor.lastrowid

    def get_last_events(self, limit: int = 20) -> list[sqlite3.Row]:
        cursor = self._conn.execute(
            "SELECT * FROM events ORDER BY id DESC LIMIT ?", (limit,)
        )
        return cursor.fetchall()

    def get_events_for_plate(self, plate_text: str) -> list[sqlite3.Row]:
        cursor = self._conn.execute(
            "SELECT * FROM events WHERE plate_text = ? ORDER BY timestamp", (plate_text,)
        )
        return cursor.fetchall()

    def close(self) -> None:
        self._conn.close()

    def __enter__(self) -> "EventRepository":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()
