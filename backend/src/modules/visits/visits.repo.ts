import type { MatchStatus, VehicleType, VisitType } from "@conjunto/contracts";
import type { Sql } from "../../db";
import type { Visit, VisitFilter, VisitStore } from "./visits.service";

interface VisitRow {
  id: number;
  visit_type: VisitType;
  full_name: string;
  document_id: string | null;
  company: string | null;
  plate: string | null;
  vehicle_type: VehicleType | null;
  destination: string | null;
  host_name: string | null;
  notes: string | null;
  entered_at: string;
  exited_at: string | null;
  registered_by: number;
  camera_event_id: number | null;
  match_status: MatchStatus;
}

const toVisit = (r: VisitRow): Visit => ({
  id: r.id, visitType: r.visit_type, fullName: r.full_name, documentId: r.document_id, company: r.company,
  plate: r.plate, vehicleType: r.vehicle_type, destination: r.destination, hostName: r.host_name, notes: r.notes,
  enteredAt: new Date(r.entered_at), exitedAt: r.exited_at ? new Date(r.exited_at) : null,
  registeredBy: r.registered_by, cameraEventId: r.camera_event_id, matchStatus: r.match_status,
});

const columns = (v: Omit<Visit, "id">): unknown[] => [
  v.visitType, v.fullName, v.documentId, v.company, v.plate, v.vehicleType, v.destination, v.hostName, v.notes,
  v.enteredAt.toISOString(), v.exitedAt?.toISOString() ?? null, v.registeredBy, v.cameraEventId, v.matchStatus,
];

function where(f: VisitFilter): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (f.activeOnly === true) parts.push("exited_at IS NULL");
  if (f.activeOnly === false) parts.push("exited_at IS NOT NULL");
  if (f.visitType) (parts.push("visit_type = ?"), params.push(f.visitType));
  if (f.start) (parts.push("entered_at >= ?"), params.push(f.start.toISOString()));
  if (f.end) (parts.push("entered_at <= ?"), params.push(f.end.toISOString()));
  if (f.search) {
    const like = `%${f.search.trim()}%`;
    parts.push("(full_name LIKE ? OR plate LIKE ? OR company LIKE ? OR destination LIKE ?)");
    params.push(like, like, like, like);
  }
  return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

export class SqliteVisitRepository implements VisitStore {
  constructor(private readonly sql: Sql) {}

  async add(v: Omit<Visit, "id">): Promise<Visit> {
    const { lastId } = this.sql.run(
      `INSERT INTO visits (visit_type, full_name, document_id, company, plate, vehicle_type, destination, host_name,
         notes, entered_at, exited_at, registered_by, camera_event_id, match_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      columns(v),
    );
    return { ...v, id: lastId };
  }

  async get(id: number): Promise<Visit | null> {
    const row = this.sql.get<VisitRow>("SELECT * FROM visits WHERE id = ?", [id]);
    return row ? toVisit(row) : null;
  }

  async update(v: Visit): Promise<Visit> {
    this.sql.run(
      `UPDATE visits SET visit_type = ?, full_name = ?, document_id = ?, company = ?, plate = ?, vehicle_type = ?,
         destination = ?, host_name = ?, notes = ?, entered_at = ?, exited_at = ?, registered_by = ?,
         camera_event_id = ?, match_status = ? WHERE id = ?`,
      [...columns(v), v.id],
    );
    return v;
  }

  async search(f: VisitFilter): Promise<Visit[]> {
    const { clause, params } = where(f);
    return this.sql
      .all<VisitRow>(`SELECT * FROM visits ${clause} ORDER BY entered_at DESC, id DESC LIMIT ? OFFSET ?`, [
        ...params, f.limit, f.offset,
      ])
      .map(toVisit);
  }

  async count(f: VisitFilter): Promise<number> {
    const { clause, params } = where(f);
    return this.sql.get<{ n: number }>(`SELECT COUNT(*) AS n FROM visits ${clause}`, params)?.n ?? 0;
  }

  async withVehicleBetween(start: Date, end: Date): Promise<Visit[]> {
    return this.sql
      .all<VisitRow>(
        `SELECT * FROM visits WHERE entered_at >= ? AND entered_at <= ? AND (plate IS NOT NULL OR vehicle_type IS NOT NULL)`,
        [start.toISOString(), end.toISOString()],
      )
      .map(toVisit);
  }
}
