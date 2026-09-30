/** Casos de uso probados con repositorios en memoria: sin base de datos, solo reglas de negocio. */
import { beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "../src/modules/auth/auth.service";
import { BcryptHasher, JwtTokens } from "../src/modules/auth/security";
import { TicketsService } from "../src/modules/tickets/tickets.service";
import { EventsService } from "../src/modules/vehicle-events/events.service";
import { ReconciliationService } from "../src/modules/visits/reconciliation.service";
import { VisitsService } from "../src/modules/visits/visits.service";
import { AppError } from "../src/shared/errors";
import { MemoryEventRepository, MemoryTicketRepository, MemoryUserRepository, MemoryVisitRepository } from "./support/memory-repos";
import { FakeClock, minutes, newEvent, T0 } from "./support/helpers";

const SECRET = "test-secret-test-secret-test-secret-32";

function setup() {
  const clock = new FakeClock();
  const users = new MemoryUserRepository();
  const auth = new AuthService(users, new BcryptHasher(4), new JwtTokens(SECRET, 60));
  const events = new EventsService(new MemoryEventRepository());
  const visitStore = new MemoryVisitRepository();
  const reconciliation = new ReconciliationService(visitStore, events);
  return {
    clock, auth, events, reconciliation,
    visits: new VisitsService(visitStore, reconciliation, clock.read),
    tickets: new TicketsService(new MemoryTicketRepository(), auth, clock.read),
  };
}

const rejects = (promise: Promise<unknown>, status: number, message?: RegExp) =>
  promise.then(
    () => expect.unreachable("debía fallar"),
    (e: unknown) => {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).status).toBe(status);
      if (message) expect((e as AppError).message).toMatch(message);
    },
  );

describe("autenticación", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => void (s = setup()));

  it("login devuelve un token que identifica al usuario (el nombre no distingue mayúsculas)", async () => {
    const admin = await s.auth.createUser({ username: "admin", full_name: "Administrador", role: "admin", password: "admin123" });
    const { accessToken } = await s.auth.login("Admin", "admin123");
    expect(await s.auth.authenticate(accessToken)).toMatchObject({ id: admin.id, role: "admin", fullName: "Administrador" });
  });

  it("usuario inexistente y clave mala dan el mismo error", async () => {
    await s.auth.createUser({ username: "admin", full_name: "A", role: "admin", password: "admin123" });
    await rejects(s.auth.login("admin", "mala"), 401, /incorrectos/);
    await rejects(s.auth.login("nadie", "admin123"), 401, /incorrectos/);
  });

  it("un usuario desactivado no puede entrar ni usar un token anterior", async () => {
    const guard = await s.auth.createUser({ username: "guardia1", full_name: "G", role: "guard", password: "guard123" });
    const { accessToken } = await s.auth.login("guardia1", "guard123");
    await s.auth.updateUser(guard.id, { is_active: false });
    await rejects(s.auth.login("guardia1", "guard123"), 401);
    await rejects(s.auth.authenticate(accessToken), 401);
  });

  it("rechaza usuario repetido y claves cortas, y guarda la clave con hash", async () => {
    const admin = await s.auth.createUser({ username: "admin", full_name: "A", role: "admin", password: "admin123" });
    await rejects(s.auth.createUser({ username: "ADMIN", full_name: "Otro", role: "guard", password: "123456" }), 409);
    expect(admin.passwordHash).not.toBe("admin123");
    expect(admin.passwordHash.startsWith("$2")).toBe(true);
  });

  it("un token basura o firmado con otra clave se rechaza", async () => {
    await s.auth.createUser({ username: "admin", full_name: "A", role: "admin", password: "admin123" });
    await rejects(s.auth.authenticate("no-es-un-token"), 401);
    const forged = new JwtTokens("otra-clave-otra-clave-otra-clave-otra-clave", 60).issue({ id: 1, role: "admin" });
    await rejects(s.auth.authenticate(forged), 401);
  });

  it("un token expirado se rechaza", async () => {
    const admin = await s.auth.createUser({ username: "admin", full_name: "A", role: "admin", password: "admin123" });
    const expired = new JwtTokens(SECRET, -1).issue({ id: admin.id, role: "admin" });
    await rejects(s.auth.authenticate(expired), 401, /expirada|inválida/);
  });
});

describe("tickets", () => {
  let s: ReturnType<typeof setup>;
  let admin: { id: number };
  let guard: { id: number };
  beforeEach(async () => {
    s = setup();
    admin = await s.auth.createUser({ username: "admin", full_name: "Administrador", role: "admin", password: "admin123" });
    guard = await s.auth.createUser({ username: "guardia1", full_name: "Guardia", role: "guard", password: "guard123" });
  });
  const input = { title: "Luz dañada", description: "Poste sin luz", category: "maintenance" as const, priority: "high" as const };

  it("crea con código correlativo, estado abierto y entrada de creación", async () => {
    const a = await s.tickets.create(admin.id, input);
    const b = await s.tickets.create(admin.id, { ...input, title: "Otro" });
    expect([a.code, b.code]).toEqual(["TCK-0001", "TCK-0002"]);
    expect(a.status).toBe("open");
    expect(a.entries.map((e) => e.kind)).toEqual(["created"]);
  });

  it("ciclo completo con historial y fecha de resolución", async () => {
    const t = await s.tickets.create(guard.id, input);
    s.clock.advance(minutes(5));
    await s.tickets.assign(t.id, admin.id, admin.id);
    await s.tickets.changeStatus(t.id, "in_progress", admin.id);
    await s.tickets.comment(t.id, "Se pidió el repuesto", admin.id);
    s.clock.advance(minutes(120));
    const done = await s.tickets.changeStatus(t.id, "resolved", admin.id);
    expect(done.resolvedAt).toEqual(s.clock.now);
    expect(done.assignedTo).toBe(admin.id);
    expect(done.entries.map((e) => e.kind)).toEqual(["created", "assignment", "status_change", "comment", "status_change"]);
    expect((await s.tickets.get(t.id)).entries).toHaveLength(5);
  });

  it("valida título, comentarios, asignados y existencia", async () => {
    await rejects(s.tickets.create(admin.id, { ...input, title: "   " }), 422);
    const t = await s.tickets.create(admin.id, input);
    await rejects(s.tickets.comment(t.id, "  ", admin.id), 422);
    await rejects(s.tickets.assign(t.id, 999, admin.id), 422, /no existe o está inactiva/);
    await rejects(s.tickets.get(999), 404);
  });

  it("no se puede asignar a alguien desactivado", async () => {
    const t = await s.tickets.create(admin.id, input);
    await s.auth.updateUser(guard.id, { is_active: false });
    await rejects(s.tickets.assign(t.id, guard.id, admin.id), 422);
  });

  it("cerrado es final y una transición inválida da 409", async () => {
    const t = await s.tickets.create(admin.id, input);
    await rejects(s.tickets.changeStatus(t.id, "resolved", admin.id), 409);
    await s.tickets.changeStatus(t.id, "closed", admin.id);
    await rejects(s.tickets.changeStatus(t.id, "open", admin.id), 409);
    await rejects(s.tickets.comment(t.id, "tarde", admin.id), 409);
  });

  it("lista con filtros y cuenta por estado (incluye estados en cero)", async () => {
    const a = await s.tickets.create(admin.id, { ...input, title: "Fuga de agua", category: "damage", priority: "urgent", location: "Casa 12" });
    await s.tickets.create(admin.id, { ...input, title: "Ruido fuerte", category: "noise", priority: "low" });
    await s.tickets.changeStatus(a.id, "in_progress", admin.id);
    const base = { limit: 50, offset: 0 };
    expect((await s.tickets.list({ ...base, status: "in_progress" })).total).toBe(1);
    expect((await s.tickets.list({ ...base, search: "casa 12" })).total).toBe(1);
    expect(await s.tickets.countsByStatus()).toEqual({ open: 1, in_progress: 1, resolved: 0, closed: 0 });
  });
});

describe("visitas y respaldo de cámaras", () => {
  let s: ReturnType<typeof setup>;
  let guard: { id: number };
  beforeEach(async () => {
    s = setup();
    guard = await s.auth.createUser({ username: "guardia1", full_name: "Guardia", role: "guard", password: "guard123" });
  });
  const uber = (over = {}) => ({
    visit_type: "delivery" as const, full_name: "Carlos Pérez", company: "Uber", plate: "AB123C",
    vehicle_type: "motorcycle" as const, destination: "Casa 5", ...over,
  });
  const seen = (offsetMin: number, plate: string | null, extra = {}) =>
    s.events.record(newEvent({ occurredAt: new Date(s.clock.now.getTime() + minutes(offsetMin)), plateText: plate, ...extra }));

  it("moto de Uber respaldada por la cámara", async () => {
    const event = await seen(-2, "AB123C");
    const { visit, match } = await s.visits.registerEntry(guard.id, uber({ plate: "ab-123c" }));
    expect(match.status).toBe("verified");
    expect(visit).toMatchObject({ plate: "AB123C", cameraEventId: event.id, matchStatus: "verified" });
  });

  it("verified aunque la cámara leyó un carácter distinto", async () => {
    await seen(0, "AB128C");
    expect((await s.visits.registerEntry(guard.id, uber())).match.status).toBe("verified");
  });

  it("possible cuando la cámara vio una moto sin placa legible, y el guardia la confirma", async () => {
    const event = await seen(-1, null);
    const { visit, match } = await s.visits.registerEntry(guard.id, uber());
    expect(match.status).toBe("possible");
    const confirmed = await s.reconciliation.confirm(visit.id, event.id);
    expect(confirmed.visit.matchStatus).toBe("verified");
    expect((await s.visits.get(visit.id)).cameraEventId).toBe(event.id);
    await rejects(s.reconciliation.confirm(visit.id, 999), 404);
  });

  it("sin evidencia de cámara", async () => {
    const { visit, match } = await s.visits.registerEntry(guard.id, uber());
    expect(match.status).toBe("no_camera_evidence");
    expect(visit.cameraEventId).toBeNull();
  });

  it("volver a comprobar encuentra un evento que la cámara procesó después", async () => {
    const { visit } = await s.visits.registerEntry(guard.id, uber());
    await seen(1, "AB123C");
    const again = await s.reconciliation.recheck(visit.id);
    expect(again.match.status).toBe("verified");
    expect((await s.visits.get(visit.id)).matchStatus).toBe("verified");
    // ya comprobada: no se vuelve a calcular
    expect((await s.reconciliation.recheck(visit.id)).match.reason).toMatch(/Ya se comprobó/);
  });

  it("una visita a pie no necesita cámara", async () => {
    const { visit, match } = await s.visits.registerEntry(guard.id, { visit_type: "visitor", full_name: "Ana Torres" });
    expect(match.status).toBe("not_applicable");
    expect(visit.vehicleType).toBeNull();
  });

  it("una placa sin tipo de vehículo se toma como auto", async () => {
    const { visit } = await s.visits.registerEntry(guard.id, { visit_type: "provider", full_name: "Proveedor", plate: "abc-1234" });
    expect(visit).toMatchObject({ vehicleType: "car", plate: "ABC1234" });
  });

  it("valida nombre y placa", async () => {
    await rejects(s.visits.registerEntry(guard.id, { visit_type: "visitor", full_name: "  " }), 422);
    await rejects(s.visits.registerEntry(guard.id, { visit_type: "visitor", full_name: "Ana", plate: "A" }), 422, /Placa/);
  });

  it("la salida se registra una sola vez", async () => {
    const { visit } = await s.visits.registerEntry(guard.id, { visit_type: "visitor", full_name: "Ana" });
    s.clock.advance(minutes(45));
    const done = await s.visits.registerExit(visit.id);
    expect(done.exitedAt).toEqual(s.clock.now);
    await rejects(s.visits.registerExit(visit.id), 409);
    await rejects(s.visits.registerExit(999), 404);
  });

  it("lista con filtros", async () => {
    await s.visits.registerEntry(guard.id, uber());
    const onFoot = (await s.visits.registerEntry(guard.id, { visit_type: "visitor", full_name: "Ana Torres", destination: "Casa 2" })).visit;
    await s.visits.registerExit(onFoot.id);
    const base = { limit: 50, offset: 0 };
    expect((await s.visits.list({ ...base, activeOnly: true })).total).toBe(1);
    expect((await s.visits.list({ ...base, activeOnly: false })).items[0]?.fullName).toBe("Ana Torres");
    expect((await s.visits.list({ ...base, search: "uber" })).total).toBe(1);
  });

  it("lista las motos que la cámara vio y nadie registró", async () => {
    await seen(0, "AB123C");
    const ghost = await seen(3, "ZZ999Z");
    const car = await seen(0, "CAR1234", { vehicleType: "car" });
    await s.visits.registerEntry(guard.id, uber());
    const start = new Date(s.clock.now.getTime() - minutes(60));
    const end = new Date(s.clock.now.getTime() + minutes(60));
    expect((await s.reconciliation.unmatched(start, end, "motorcycle")).map((e) => e.id)).toEqual([ghost.id]);
    expect(new Set((await s.reconciliation.unmatched(start, end)).map((e) => e.id))).toEqual(new Set([ghost.id, car.id]));
  });
});

describe("eventos de cámara", () => {
  it("guarda la placa normalizada, y una lectura basura como sin placa", async () => {
    const { events } = setup();
    expect((await events.record(newEvent({ plateText: "ab-123c" }))).plateText).toBe("AB123C");
    expect((await events.record(newEvent({ plateText: "??" }))).plateText).toBeNull();
  });

  it("busca por placa aunque se escriba con guion, y resume por tipo, color y hora", async () => {
    const { events } = setup();
    await events.record(newEvent({ occurredAt: T0, plateText: "AB123C", color: "negro" }));
    await events.record(newEvent({ occurredAt: new Date(T0.getTime() + minutes(60)), vehicleType: "car", color: "blanco" }));
    await events.record(newEvent({ occurredAt: new Date(T0.getTime() + minutes(65)), vehicleType: "car", color: "blanco" }));

    expect((await events.list({ plate: "ab-123", limit: 50, offset: 0 })).total).toBe(1);
    const summary = await events.summary(new Date(T0.getTime() - minutes(60)), new Date(T0.getTime() + minutes(180)));
    expect(summary).toEqual({
      total: 3, byType: { motorcycle: 1, car: 2 }, byColor: { negro: 1, blanco: 2 }, byHour: { "14": 1, "15": 2 },
    });
    await rejects(events.get(999), 404);
  });
});
