import type { VehicleType } from "@conjunto/contracts";
import type { Sql } from "../../db";
import type { EventFilter, EventStore, NewVehicleEvent, VehicleEvent } from "./events.service";

interface EventRow {
  id: number;
  camera_id: string;
  occurred_at: string;
  vehicle_type: VehicleType;
  color: string | null;
  plate_text: string | null;
  plate_confidence: number | null;
  direction: string | null;
  tracker_id: number | null;
  snapshot_file: string | null;
}

const toEvent = (r: EventRow): VehicleEvent => ({
  id: r.id, cameraId: r.camera_id, occurredAt: new Date(r.occurred_at), vehicleType: r.vehicle_type,
  color: r.color, plateText: r.plate_text, plateConfidence: r.plate_confidence, direction: r.direction,
  trackerId: r.tracker_id, snapshotFile: r.snapshot_file,
});

function where(f: EventFilter): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (f.start) (parts.push("occurred_at >= ?"), params.push(f.start.toISOString()));
  if (f.end) (parts.push("occurred_at <= ?"), params.push(f.end.toISOString()));
  if (f.plate) (parts.push("plate_text LIKE ?"), params.push(`%${f.plate}%`));
  if (f.vehicleType) (parts.push("vehicle_type = ?"), params.push(f.vehicleType));
  if (f.color) (parts.push("color = ?"), params.push(f.color));
  return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

export class SqliteEventRepository implements EventStore {
  constructor(private readonly sql: Sql) {}

  async add(e: NewVehicleEvent): Promise<VehicleEvent> {
    const { lastId } = this.sql.run(
      `INSERT INTO vehicle_events
         (camera_id, occurred_at, vehicle_type, color, plate_text, plate_confidence, direction, tracker_id, snapshot_file)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.cameraId, e.occurredAt.toISOString(), e.vehicleType, e.color, e.plateText, e.plateConfidence,
        e.direction, e.trackerId, e.snapshotFile],
    );
    return { ...e, id: lastId };
  }

  async get(id: number): Promise<VehicleEvent | null> {
    const row = this.sql.get<EventRow>("SELECT * FROM vehicle_events WHERE id = ?", [id]);
    return row ? toEvent(row) : null;
  }

  async search(f: EventFilter): Promise<VehicleEvent[]> {
    const { clause, params } = where(f);
    return this.sql
      .all<EventRow>(`SELECT * FROM vehicle_events ${clause} ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?`, [
        ...params, f.limit, f.offset,
      ])
      .map(toEvent);
  }

  async count(f: EventFilter): Promise<number> {
    const { clause, params } = where(f);
    return this.sql.get<{ n: number }>(`SELECT COUNT(*) AS n FROM vehicle_events ${clause}`, params)?.n ?? 0;
  }

  async between(start: Date, end: Date): Promise<VehicleEvent[]> {
    return this.sql
      .all<EventRow>("SELECT * FROM vehicle_events WHERE occurred_at >= ? AND occurred_at <= ? ORDER BY occurred_at, id", [
        start.toISOString(), end.toISOString(),
      ])
      .map(toEvent);
  }
}
