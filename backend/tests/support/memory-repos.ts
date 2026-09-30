/**
 * Implementaciones en memoria de los repositorios. Sirven para probar los servicios sin base de datos y,
 * junto con las de SQLite, para comprobar que ambas se comportan igual (sustitución de Liskov).
 */
import type { TicketStatus } from "@conjunto/contracts";
import type { User, UserStore } from "../../src/modules/auth/auth.service";
import type { EventFilter, EventStore, NewVehicleEvent, VehicleEvent } from "../../src/modules/vehicle-events/events.service";
import type { Ticket } from "../../src/modules/tickets/tickets.rules";
import type { TicketFilter, TicketStore } from "../../src/modules/tickets/tickets.service";
import type { Visit, VisitFilter, VisitStore } from "../../src/modules/visits/visits.service";

const page = <T>(items: T[], limit: number, offset: number) => items.slice(offset, offset + limit);
const has = (text: string | null, needle: string) => (text ?? "").toLowerCase().includes(needle.toLowerCase());

export class MemoryUserRepository implements UserStore {
  private rows: User[] = [];
  private next = 1;
  async add(user: Omit<User, "id">) {
    const saved = { ...user, id: this.next++ };
    this.rows.push(saved);
    return { ...saved };
  }
  async get(id: number) {
    const u = this.rows.find((r) => r.id === id);
    return u ? { ...u } : null;
  }
  async getByUsername(username: string) {
    const u = this.rows.find((r) => r.username === username);
    return u ? { ...u } : null;
  }
  async list() {
    return this.rows.map((r) => ({ ...r }));
  }
  async update(user: User) {
    this.rows = this.rows.map((r) => (r.id === user.id ? { ...user } : r));
    return { ...user };
  }
}

export class MemoryEventRepository implements EventStore {
  private rows: VehicleEvent[] = [];
  private next = 1;
  async add(e: NewVehicleEvent) {
    const saved = { ...e, id: this.next++ };
    this.rows.push(saved);
    return { ...saved };
  }
  async get(id: number) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  private filtered(f: EventFilter) {
    return this.rows.filter(
      (e) =>
        (!f.start || e.occurredAt >= f.start) &&
        (!f.end || e.occurredAt <= f.end) &&
        (!f.plate || (e.plateText ?? "").includes(f.plate)) &&
        (!f.vehicleType || e.vehicleType === f.vehicleType) &&
        (!f.color || e.color === f.color),
    );
  }
  async search(f: EventFilter) {
    const sorted = this.filtered(f).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.id - a.id);
    return page(sorted, f.limit, f.offset);
  }
  async count(f: EventFilter) {
    return this.filtered(f).length;
  }
  async between(start: Date, end: Date) {
    return this.rows
      .filter((e) => e.occurredAt >= start && e.occurredAt <= end)
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id - b.id);
  }
}

export class MemoryVisitRepository implements VisitStore {
  private rows: Visit[] = [];
  private next = 1;
  async add(v: Omit<Visit, "id">) {
    const saved = { ...v, id: this.next++ };
    this.rows.push(saved);
    return { ...saved };
  }
  async get(id: number) {
    const v = this.rows.find((r) => r.id === id);
    return v ? { ...v } : null;
  }
  async update(v: Visit) {
    this.rows = this.rows.map((r) => (r.id === v.id ? { ...v } : r));
    return { ...v };
  }
  private filtered(f: VisitFilter) {
    return this.rows.filter(
      (v) =>
        (f.activeOnly === undefined || (v.exitedAt === null) === f.activeOnly) &&
        (!f.visitType || v.visitType === f.visitType) &&
        (!f.start || v.enteredAt >= f.start) &&
        (!f.end || v.enteredAt <= f.end) &&
        (!f.search || [v.fullName, v.plate, v.company, v.destination].some((t) => has(t, f.search!.trim()))),
    );
  }
  async search(f: VisitFilter) {
    const sorted = this.filtered(f).sort((a, b) => b.enteredAt.getTime() - a.enteredAt.getTime() || b.id - a.id);
    return page(sorted, f.limit, f.offset).map((v) => ({ ...v }));
  }
  async count(f: VisitFilter) {
    return this.filtered(f).length;
  }
  async withVehicleBetween(start: Date, end: Date) {
    return this.rows.filter((v) => v.enteredAt >= start && v.enteredAt <= end && (v.plate !== null || v.vehicleType !== null));
  }
}

export class MemoryTicketRepository implements TicketStore {
  private rows: Ticket[] = [];
  private next = 1;
  private nextEntry = 1;
  private clone(t: Ticket): Ticket {
    return { ...t, entries: t.entries.map((e) => ({ ...e })) };
  }
  private withIds(t: Ticket): Ticket {
    return { ...t, entries: t.entries.map((e) => (e.id === undefined ? { ...e, id: this.nextEntry++ } : e)) };
  }
  async add(t: Omit<Ticket, "id" | "code">) {
    const id = this.next++;
    const saved = this.withIds({ ...t, id, code: `TCK-${String(id).padStart(4, "0")}` });
    this.rows.push(saved);
    return this.clone(saved);
  }
  async get(id: number) {
    const t = this.rows.find((r) => r.id === id);
    return t ? this.clone(t) : null;
  }
  async save(t: Ticket) {
    const saved = this.withIds(t);
    this.rows = this.rows.map((r) => (r.id === t.id ? saved : r));
    return this.clone(saved);
  }
  private filtered(f: TicketFilter) {
    return this.rows.filter(
      (t) =>
        (!f.status || t.status === f.status) &&
        (!f.category || t.category === f.category) &&
        (!f.priority || t.priority === f.priority) &&
        (f.assignedTo === undefined || t.assignedTo === f.assignedTo) &&
        (!f.search || [t.code, t.title, t.location].some((x) => has(x, f.search!.trim()))),
    );
  }
  async search(f: TicketFilter) {
    const sorted = this.filtered(f).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || b.id - a.id);
    return page(sorted, f.limit, f.offset).map((t) => this.clone(t));
  }
  async count(f: TicketFilter) {
    return this.filtered(f).length;
  }
  async countsByStatus() {
    const counts: Partial<Record<TicketStatus, number>> = {};
    for (const t of this.rows) counts[t.status] = (counts[t.status] ?? 0) + 1;
    return counts;
  }
}
