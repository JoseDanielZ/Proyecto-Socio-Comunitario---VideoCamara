import type { TicketCategory, TicketEntryKind, TicketPriority, TicketStatus } from "@conjunto/contracts";
import type { Sql } from "../../db";
import type { TicketFilter, TicketStore } from "./tickets.service";
import type { Ticket, TicketEntry } from "./tickets.rules";

interface TicketRow {
  id: number;
  code: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  location: string | null;
  reporter_name: string | null;
  reporter_contact: string | null;
  created_by: number;
  assigned_to: number | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface EntryRow {
  id: number;
  ticket_id: number;
  kind: TicketEntryKind;
  author_id: number;
  created_at: string;
  body: string | null;
  from_status: TicketStatus | null;
  to_status: TicketStatus | null;
}

const toEntry = (r: EntryRow): TicketEntry => ({
  id: r.id, kind: r.kind, authorId: r.author_id, createdAt: new Date(r.created_at), body: r.body,
  fromStatus: r.from_status, toStatus: r.to_status,
});

const toTicket = (r: TicketRow, entries: EntryRow[]): Ticket => ({
  id: r.id, code: r.code, title: r.title, description: r.description, category: r.category,
  priority: r.priority, status: r.status, location: r.location, reporterName: r.reporter_name,
  reporterContact: r.reporter_contact, createdBy: r.created_by, assignedTo: r.assigned_to,
  createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
  resolvedAt: r.resolved_at ? new Date(r.resolved_at) : null, entries: entries.map(toEntry),
});

function where(f: TicketFilter): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (f.status) (parts.push("status = ?"), params.push(f.status));
  if (f.category) (parts.push("category = ?"), params.push(f.category));
  if (f.priority) (parts.push("priority = ?"), params.push(f.priority));
  if (f.assignedTo !== undefined) (parts.push("assigned_to = ?"), params.push(f.assignedTo));
  if (f.search) {
    const like = `%${f.search.trim()}%`;
    parts.push("(code LIKE ? OR title LIKE ? OR location LIKE ?)");
    params.push(like, like, like);
  }
  return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

export class SqliteTicketRepository implements TicketStore {
  constructor(private readonly sql: Sql) {}

  private insertEntry(ticketId: number, e: TicketEntry): void {
    this.sql.run(
      "INSERT INTO ticket_entries (ticket_id, kind, author_id, created_at, body, from_status, to_status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [ticketId, e.kind, e.authorId, e.createdAt.toISOString(), e.body, e.fromStatus, e.toStatus],
    );
  }

  private load(rows: TicketRow[]): Ticket[] {
    if (rows.length === 0) return [];
    const marks = rows.map(() => "?").join(",");
    const entries = this.sql.all<EntryRow>(
      `SELECT * FROM ticket_entries WHERE ticket_id IN (${marks}) ORDER BY id`,
      rows.map((r) => r.id),
    );
    return rows.map((r) =>
      toTicket(r, entries.filter((e) => e.ticket_id === r.id)),
    );
  }

  async add(t: Omit<Ticket, "id" | "code">): Promise<Ticket> {
    const id = this.sql.transaction(() => {
      const { lastId } = this.sql.run(
        `INSERT INTO tickets (code, title, description, category, priority, status, location, reporter_name,
           reporter_contact, created_by, assigned_to, created_at, updated_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [`TMP-${crypto.randomUUID()}`, t.title, t.description, t.category, t.priority, t.status, t.location,
          t.reporterName, t.reporterContact, t.createdBy, t.assignedTo, t.createdAt.toISOString(),
          t.updatedAt.toISOString(), t.resolvedAt?.toISOString() ?? null],
      );
      // El código correlativo se deriva del id, que solo se conoce tras insertar.
      this.sql.run("UPDATE tickets SET code = ? WHERE id = ?", [`TCK-${String(lastId).padStart(4, "0")}`, lastId]);
      for (const entry of t.entries) this.insertEntry(lastId, entry);
      return lastId;
    });
    return (await this.get(id))!;
  }

  async get(id: number): Promise<Ticket | null> {
    const row = this.sql.get<TicketRow>("SELECT * FROM tickets WHERE id = ?", [id]);
    return row ? this.load([row])[0]! : null;
  }

  async save(t: Ticket): Promise<Ticket> {
    this.sql.transaction(() => {
      this.sql.run("UPDATE tickets SET status = ?, assigned_to = ?, updated_at = ?, resolved_at = ? WHERE id = ?", [
        t.status, t.assignedTo, t.updatedAt.toISOString(), t.resolvedAt?.toISOString() ?? null, t.id,
      ]);
      for (const entry of t.entries) if (entry.id === undefined) this.insertEntry(t.id, entry);
    });
    return (await this.get(t.id))!;
  }

  async search(f: TicketFilter): Promise<Ticket[]> {
    const { clause, params } = where(f);
    const rows = this.sql.all<TicketRow>(
      `SELECT * FROM tickets ${clause} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, f.limit, f.offset],
    );
    return this.load(rows);
  }

  async count(f: TicketFilter): Promise<number> {
    const { clause, params } = where(f);
    return this.sql.get<{ n: number }>(`SELECT COUNT(*) AS n FROM tickets ${clause}`, params)?.n ?? 0;
  }

  async countsByStatus(): Promise<Partial<Record<TicketStatus, number>>> {
    const rows = this.sql.all<{ status: TicketStatus; n: number }>("SELECT status, COUNT(*) AS n FROM tickets GROUP BY status");
    return Object.fromEntries(rows.map((r) => [r.status, r.n]));
  }
}
