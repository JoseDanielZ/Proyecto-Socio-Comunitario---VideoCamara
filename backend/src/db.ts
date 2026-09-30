import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * Lo único que los repositorios saben de la base de datos. Si mañana se cambia SQLite por
 * PostgreSQL, se escribe otra implementación de `Sql`; los repositorios no se tocan.
 */
export interface Sql {
  run(sql: string, params?: unknown[]): { lastId: number; changes: number };
  get<T>(sql: string, params?: unknown[]): T | undefined;
  all<T>(sql: string, params?: unknown[]): T[];
  transaction<T>(work: () => T): T;
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS vehicle_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  camera_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  color TEXT,
  plate_text TEXT,
  plate_confidence REAL,
  direction TEXT,
  tracker_id INTEGER,
  snapshot_file TEXT
);
CREATE INDEX IF NOT EXISTS ix_events_occurred ON vehicle_events(occurred_at);
CREATE INDEX IF NOT EXISTS ix_events_plate ON vehicle_events(plate_text);
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_type TEXT NOT NULL,
  full_name TEXT NOT NULL,
  document_id TEXT,
  company TEXT,
  plate TEXT,
  vehicle_type TEXT,
  destination TEXT,
  host_name TEXT,
  notes TEXT,
  entered_at TEXT NOT NULL,
  exited_at TEXT,
  registered_by INTEGER NOT NULL REFERENCES users(id),
  camera_event_id INTEGER REFERENCES vehicle_events(id),
  match_status TEXT NOT NULL DEFAULT 'not_applicable'
);
CREATE INDEX IF NOT EXISTS ix_visits_entered ON visits(entered_at);
CREATE INDEX IF NOT EXISTS ix_visits_plate ON visits(plate);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  location TEXT,
  reporter_name TEXT,
  reporter_contact TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  assigned_to INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_tickets_status ON tickets(status);
CREATE TABLE IF NOT EXISTS ticket_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  kind TEXT NOT NULL,
  author_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  body TEXT,
  from_status TEXT,
  to_status TEXT
);
CREATE INDEX IF NOT EXISTS ix_entries_ticket ON ticket_entries(ticket_id);
`;

/** Abre (y crea si falta) la base SQLite. `":memory:"` sirve para pruebas. */
export function openDatabase(file: string): Sql {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  return {
    run(sql, params = []) {
      const result = db.prepare(sql).run(...params);
      return { lastId: Number(result.lastInsertRowid), changes: result.changes };
    },
    get: <T>(sql: string, params: unknown[] = []) => db.prepare(sql).get(...params) as T | undefined,
    all: <T>(sql: string, params: unknown[] = []) => db.prepare(sql).all(...params) as T[],
    transaction: <T>(work: () => T) => db.transaction(work)(),
    close: () => void db.close(),
  };
}
