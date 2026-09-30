/** La API completa por HTTP. Cada respuesta se valida contra el contrato compartido con el frontend. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  dashboardSchema, sessionSchema, ticketPageSchema, ticketSchema, ticketStatsSchema, userSchema,
  vehicleEventPageSchema, vehicleEventSchema, vehicleEventSummarySchema, visitPageSchema, visitWithMatchSchema,
  cameraSchema, type Role,
} from "@conjunto/contracts";
import { createApp } from "../src/app";
import { buildServices } from "../src/compose";
import { openDatabase, type Sql } from "../src/db";
import { newEvent, testConfig } from "./support/helpers";

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("jpeg-falso"), Buffer.from([0xff, 0xd9])]);
const KEY = { "X-Ingest-Key": "clave-de-ingesta-de-pruebas" };

let sql: Sql;
let dir: string;
let services: ReturnType<typeof buildServices>;
let api: ReturnType<typeof request>;

function boot(overrides = {}) {
  sql = openDatabase(":memory:");
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "conjunto-"));
  const config = testConfig({ snapshotsDir: dir, ...overrides });
  services = buildServices(config, sql, { hashRounds: 4 });
  api = request(createApp(config, services));
}
beforeEach(() => boot());
afterEach(() => {
  sql.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function login(username: string, role: Role) {
  await services.auth.createUser({ username, full_name: username[0]!.toUpperCase() + username.slice(1), role, password: "secret123" });
  const res = await api.post("/api/auth/login").send({ username, password: "secret123" }).expect(200);
  const session = sessionSchema.parse(res.body);
  return { Authorization: `Bearer ${session.access_token}` };
}
const asAdmin = () => login("admin", "admin");
const asGuard = () => login("guardia", "guard");
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
const record = (minAgo: number, plate: string | null, extra = {}) =>
  services.events.record(newEvent({ occurredAt: minutesAgo(minAgo), plateText: plate, ...extra }));

describe("acceso y seguridad", () => {
  it("health es público", async () => {
    expect((await api.get("/api/health")).body).toEqual({ status: "ok" });
  });

  it("todo lo demás exige sesión (401 con WWW-Authenticate)", async () => {
    for (const p of ["/api/tickets", "/api/visits", "/api/vehicle-events", "/api/cameras", "/api/dashboard", "/api/users"]) {
      const res = await api.get(p);
      expect(res.status, p).toBe(401);
      expect(res.headers["www-authenticate"]).toBe("Bearer");
    }
  });

  it("credenciales y tokens incorrectos", async () => {
    await asAdmin();
    expect((await api.post("/api/auth/login").send({ username: "admin", password: "otra" })).status).toBe(401);
    expect((await api.get("/api/auth/me").set("Authorization", "Bearer basura")).status).toBe(401);
    expect((await api.post("/api/auth/login").send({})).status).toBe(422);
  });

  it("/auth/me devuelve el perfil sin datos de la clave", async () => {
    const admin = await asAdmin();
    const res = await api.get("/api/auth/me").set(admin).expect(200);
    expect(userSchema.parse(res.body)).toMatchObject({ username: "admin", role: "admin" });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });

  it("frena la adivinanza de claves con 429 tras varios fallos (los aciertos no cuentan)", async () => {
    sql.close();
    boot({ loginMaxAttempts: 3 });
    await services.auth.createUser({ username: "admin", full_name: "A", role: "admin", password: "secret123" });
    for (let i = 0; i < 3; i++) await api.post("/api/auth/login").send({ username: "admin", password: "mala" }).expect(401);
    const blocked = await api.post("/api/auth/login").send({ username: "admin", password: "secret123" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.detail).toMatch(/Demasiados intentos/);
  });

  it("cabeceras de seguridad y CORS solo para el front", async () => {
    const res = await api.options("/api/tickets").set({ Origin: "http://localhost:5173", "Access-Control-Request-Method": "GET" });
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    const other = await api.get("/api/health").set("Origin", "http://malicioso.example");
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
    const health = await api.get("/api/health");
    expect(health.headers["x-content-type-options"]).toBe("nosniff");
    expect(health.headers["x-powered-by"]).toBeUndefined();
  });

  it("JSON mal formado y rutas inexistentes responden claro, sin detalles internos", async () => {
    const bad = await api.post("/api/auth/login").set("Content-Type", "application/json").send("{no es json");
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ detail: "Petición no válida" });
    expect((await api.get("/api/nada")).status).toBe(404);
  });

  it("solo la administración gestiona usuarios", async () => {
    const guard = await asGuard();
    const admin = await asAdmin();
    expect((await api.get("/api/users").set(guard)).status).toBe(403);
    const created = await api.post("/api/users").set(admin)
      .send({ username: "nuevo", full_name: "Nuevo Guardia", role: "guard", password: "clave123" }).expect(201);
    expect(userSchema.parse(created.body).role).toBe("guard");
    expect((await api.post("/api/users").set(admin)
      .send({ username: "nuevo", full_name: "X", role: "guard", password: "clave123" })).status).toBe(409);
    const off = await api.patch(`/api/users/${created.body.id}`).set(admin).send({ is_active: false }).expect(200);
    expect(off.body.is_active).toBe(false);
    expect((await api.post("/api/auth/login").send({ username: "nuevo", password: "clave123" })).status).toBe(401);
  });

  it("los errores de validación indican el campo (formato que entiende el frontend)", async () => {
    const admin = await asAdmin();
    const res = await api.post("/api/users").set(admin).send({ username: "ab", full_name: "X", role: "guard", password: "123" });
    expect(res.status).toBe(422);
    expect(res.body.detail[0]).toEqual({ loc: expect.any(Array), msg: expect.any(String) });
    expect(res.body.detail.map((d: { loc: string[] }) => d.loc[0])).toEqual(expect.arrayContaining(["username", "password"]));
  });
});

describe("tickets", () => {
  const body = (over = {}) => ({
    title: "Foco quemado", description: "Pasillo de la torre 2", category: "maintenance", priority: "high",
    location: "Torre 2", reporter_name: "Sra. López", ...over,
  });

  it("flujo completo con permisos por rol", async () => {
    const admin = await asAdmin();
    const guard = await asGuard();
    const created = await api.post("/api/tickets").set(guard).send(body()).expect(201);
    const ticket = ticketSchema.parse(created.body);
    expect(ticket).toMatchObject({ code: "TCK-0001", status: "open", created_by_name: "Guardia" });
    expect(ticket.entries[0]?.kind).toBe("created");

    await api.post(`/api/tickets/${ticket.id}/comments`).set(guard).send({ body: "Ya avisé" }).expect(201);
    expect((await api.patch(`/api/tickets/${ticket.id}/status`).set(guard).send({ status: "in_progress" })).status).toBe(403);
    expect((await api.patch(`/api/tickets/${ticket.id}/assign`).set(guard).send({ assignee_id: 1 })).status).toBe(403);

    const adminId = (await api.get("/api/auth/me").set(admin)).body.id;
    const assigned = await api.patch(`/api/tickets/${ticket.id}/assign`).set(admin).send({ assignee_id: adminId }).expect(200);
    expect(assigned.body.assigned_to_name).toBe("Admin");
    await api.patch(`/api/tickets/${ticket.id}/status`).set(admin).send({ status: "in_progress" }).expect(200);
    const done = ticketSchema.parse((await api.patch(`/api/tickets/${ticket.id}/status`).set(admin).send({ status: "resolved" })).body);
    expect(done.resolved_at).not.toBeNull();
    expect(done.entries.map((e) => e.kind)).toEqual(["created", "comment", "assignment", "status_change", "status_change"]);
    expect((await api.patch(`/api/tickets/${ticket.id}/status`).set(admin).send({ status: "open" })).status).toBe(409);
  });

  it("validaciones y ticket inexistente", async () => {
    const guard = await asGuard();
    expect((await api.post("/api/tickets").set(guard).send(body({ title: "" }))).status).toBe(422);
    expect((await api.post("/api/tickets").set(guard).send(body({ category: "nope" }))).status).toBe(422);
    expect((await api.post("/api/tickets").set(guard).send(body({ title: "   " }))).status).toBe(422);
    expect((await api.get("/api/tickets/999").set(guard)).status).toBe(404);
    expect((await api.get("/api/tickets/abc").set(guard)).status).toBe(422);
  });

  it("lista con filtros y estadísticas (contrato)", async () => {
    const admin = await asAdmin();
    await api.post("/api/tickets").set(admin).send(body({ title: "Fuga", category: "damage" }));
    await api.post("/api/tickets").set(admin).send(body({ title: "Ruido", category: "noise" }));
    expect(ticketPageSchema.parse((await api.get("/api/tickets?category=noise").set(admin)).body).total).toBe(1);
    expect((await api.get("/api/tickets?q=fuga").set(admin)).body.items[0].title).toBe("Fuga");
    expect((await api.get("/api/tickets?limit=0").set(admin)).status).toBe(422);
    const stats = ticketStatsSchema.parse((await api.get("/api/tickets/stats").set(admin)).body);
    expect(stats.by_status).toEqual({ open: 2, in_progress: 0, resolved: 0, closed: 0 });
  });
});

describe("visitas y respaldo de cámaras", () => {
  const uber = (over = {}) => ({
    visit_type: "delivery", full_name: "Carlos Pérez", company: "Uber", plate: "ab-123c",
    vehicle_type: "motorcycle", destination: "Casa 5", ...over,
  });

  it("moto de Uber respaldada por la cámara", async () => {
    const guard = await asGuard();
    const seen = await record(2, "AB123C");
    const res = await api.post("/api/visits").set(guard).send(uber()).expect(201);
    const body = visitWithMatchSchema.parse(res.body);
    expect(body.visit.plate).toBe("AB123C");
    expect(body.camera_match.status).toBe("verified");
    expect(body.camera_match.event?.id).toBe(seen.id);
    expect(body.visit.camera_event_id).toBe(seen.id);
  });

  it("sin evidencia, y luego se vuelve a comprobar cuando la cámara procesó el vehículo", async () => {
    const guard = await asGuard();
    const first = visitWithMatchSchema.parse((await api.post("/api/visits").set(guard).send(uber())).body);
    expect(first.camera_match.status).toBe("no_camera_evidence");
    await record(0, "AB123C");
    const again = visitWithMatchSchema.parse((await api.get(`/api/visits/${first.visit.id}/camera-match`).set(guard)).body);
    expect(again.camera_match.status).toBe("verified");
  });

  it("posible coincidencia confirmada por el guardia", async () => {
    const guard = await asGuard();
    const seen = await record(1, null);
    const body = visitWithMatchSchema.parse((await api.post("/api/visits").set(guard).send(uber())).body);
    expect(body.camera_match.status).toBe("possible");
    const ok = await api.post(`/api/visits/${body.visit.id}/confirm-camera-event`).set(guard).send({ event_id: seen.id }).expect(200);
    expect(ok.body.visit.match_status).toBe("verified");
    expect((await api.post(`/api/visits/${body.visit.id}/confirm-camera-event`).set(guard).send({ event_id: 999 })).status).toBe(404);
  });

  it("lista, salida y validaciones", async () => {
    const guard = await asGuard();
    const visit = visitWithMatchSchema.parse(
      (await api.post("/api/visits").set(guard).send({ visit_type: "visitor", full_name: "Ana Torres", destination: "Casa 2" })).body,
    ).visit;
    expect(visit).toMatchObject({ is_active: true, match_status: "not_applicable" });
    expect(visitPageSchema.parse((await api.get("/api/visits?active=true").set(guard)).body).total).toBe(1);
    expect((await api.patch(`/api/visits/${visit.id}/exit`).set(guard)).body.is_active).toBe(false);
    expect((await api.patch(`/api/visits/${visit.id}/exit`).set(guard)).status).toBe(409);
    expect((await api.get("/api/visits?active=true").set(guard)).body.total).toBe(0);
    expect((await api.get("/api/visits?q=torres").set(guard)).body.total).toBe(1);
    expect((await api.post("/api/visits").set(guard).send({ visit_type: "visitor", full_name: "  " })).status).toBe(422);
    expect((await api.post("/api/visits").set(guard).send({ visit_type: "visitor", full_name: "X", plate: "A" })).status).toBe(422);
    expect((await api.get("/api/visits/999").set(guard)).status).toBe(404);
  });

  it("motos que la cámara vio y nadie registró", async () => {
    const guard = await asGuard();
    const ghost = await record(5, "ZZ999Z");
    await record(1, "AB123C");
    await record(1, "CAR1234", { vehicleType: "car" });
    await api.post("/api/visits").set(guard).send(uber());
    const motos = await api.get("/api/visits/unmatched-vehicles").set(guard).expect(200);
    expect(vehicleEventPageSchema.shape.items.parse(motos.body).map((e) => e.id)).toEqual([ghost.id]);
    const cars = await api.get("/api/visits/unmatched-vehicles?type=car").set(guard);
    expect(cars.body.map((e: { plate_text: string }) => e.plate_text)).toEqual(["CAR1234"]);
  });
});

describe("cámaras y eventos", () => {
  it("el motor de visión envía estado, fotogramas y eventos con su clave", async () => {
    const guard = await asGuard();
    expect((await api.post("/api/internal/cameras/entrada/status").send({ status: "running" })).status).toBe(401);
    expect((await api.post("/api/internal/cameras/entrada/status").set("X-Ingest-Key", "mala").send({ status: "running" })).status).toBe(401);
    await api.post("/api/internal/cameras/entrada/status").set(KEY).send({ status: "running", crossings: 3 }).expect(204);
    await api.put("/api/internal/cameras/entrada/frame").set(KEY).set("Content-Type", "image/jpeg").send(JPEG).expect(204);

    const cams = (await api.get("/api/cameras").set(guard)).body;
    expect(cameraSchema.parse(cams[0])).toMatchObject({ id: "entrada", status: "running", crossings: 3 });
    const snap = await api.get("/api/cameras/entrada/snapshot.jpg").set(guard);
    expect(snap.headers["content-type"]).toBe("image/jpeg");
    expect(Buffer.compare(snap.body, JPEG)).toBe(0);
    expect((await api.get("/api/cameras/otra/snapshot.jpg").set(guard)).status).toBe(404);
  });

  it("rechaza fotogramas que no son JPEG y cámaras desconocidas", async () => {
    await api.put("/api/internal/cameras/entrada/frame").set(KEY).set("Content-Type", "image/jpeg").send(Buffer.from("no soy jpeg")).expect(422);
    await api.put("/api/internal/cameras/otra/frame").set(KEY).set("Content-Type", "image/jpeg").send(JPEG).expect(404);
  });

  it("sin INGEST_API_KEY configurada la ingesta queda deshabilitada (503)", async () => {
    sql.close();
    boot({ ingestApiKey: null });
    const res = await api.post("/api/internal/cameras/entrada/status").set(KEY).send({ status: "running" });
    expect(res.status).toBe(503);
  });

  it("un evento enviado por el motor de visión aparece en la API con tipo, color y foto", async () => {
    const guard = await asGuard();
    const sent = await api.post("/api/internal/vehicle-events").set(KEY).send({
      camera_id: "entrada", occurred_at: new Date().toISOString(), vehicle_type: "car", color: "rojo",
      plate_text: "pba-1234", plate_confidence: 0.9, direction: "entrada", tracker_id: 4, snapshot_file: "a.jpg",
    }).expect(201);
    const list = vehicleEventPageSchema.parse((await api.get("/api/vehicle-events").set(guard)).body);
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({
      id: sent.body.id, vehicle_type: "car", color: "rojo", plate_text: "PBA1234",
      snapshot_url: `/api/vehicle-events/${sent.body.id}/snapshot`,
    });
  });

  it("un evento inválido se rechaza, incluido un nombre de foto que intenta salir de la carpeta", async () => {
    const base = { camera_id: "entrada", occurred_at: new Date().toISOString(), vehicle_type: "car" };
    await api.post("/api/internal/vehicle-events").set(KEY).send({ ...base, vehicle_type: "tractor" }).expect(422);
    await api.post("/api/internal/vehicle-events").set(KEY).send({ ...base, snapshot_file: "../../secreto.jpg" }).expect(422);
    await api.post("/api/internal/vehicle-events").set(KEY).send({ ...base, snapshot_file: "C:/Windows/x.jpg" }).expect(422);
  });

  it("filtros, resumen y fotos: solo se sirven archivos de la carpeta de fotos", async () => {
    const guard = await asGuard();
    fs.writeFileSync(path.join(dir, "a.jpg"), JPEG);
    fs.writeFileSync(path.join(path.dirname(dir), "secreto.jpg"), "no-debe-salir");
    const withPhoto = await record(1, "AB123C", { snapshotFile: "a.jpg" });
    const sneaky = await record(1, "ZZ999Z", { snapshotFile: "../secreto.jpg" }); // como si la base estuviera manipulada
    const missing = await record(1, null, { vehicleType: "car", snapshotFile: "no-existe.jpg" });

    expect(vehicleEventPageSchema.parse((await api.get("/api/vehicle-events?type=motorcycle").set(guard)).body).total).toBe(2);
    expect((await api.get("/api/vehicle-events?plate=ab-123").set(guard)).body.total).toBe(1);
    const summary = vehicleEventSummarySchema.parse((await api.get("/api/vehicle-events/summary").set(guard)).body);
    expect(summary).toMatchObject({ total: 3, by_type: { motorcycle: 2, car: 1 } });

    const photo = await api.get(`/api/vehicle-events/${withPhoto.id}/snapshot`).set(guard);
    expect(photo.status).toBe(200);
    expect(Buffer.compare(photo.body, JPEG)).toBe(0);
    expect((await api.get(`/api/vehicle-events/${sneaky.id}/snapshot`).set(guard)).status).toBe(404);
    expect((await api.get(`/api/vehicle-events/${missing.id}/snapshot`).set(guard)).status).toBe(404);
    expect((await api.get("/api/vehicle-events/999/snapshot").set(guard)).status).toBe(404);
    fs.rmSync(path.join(path.dirname(dir), "secreto.jpg"), { force: true });
  });

  it("las imágenes aceptan el token en la URL (para <img>), pero un token malo no", async () => {
    await api.put("/api/internal/cameras/entrada/frame").set(KEY).set("Content-Type", "image/jpeg").send(JPEG);
    const token = (await asGuard()).Authorization.slice(7);
    expect((await api.get(`/api/cameras/entrada/snapshot.jpg?access_token=${token}`)).status).toBe(200);
    expect((await api.get("/api/cameras/entrada/snapshot.jpg?access_token=mala")).status).toBe(401);
  });
});

describe("inicio", () => {
  it("resume el día con cámaras, visitas, tickets y motos sin registrar", async () => {
    const guard = await asGuard();
    await record(1, "ZZ999Z");
    await api.post("/api/visits").set(guard).send({ visit_type: "visitor", full_name: "Ana" });
    await api.post("/api/tickets").set(guard).send({ title: "Foco", description: "" });
    await api.post("/api/internal/cameras/entrada/status").set(KEY).send({ status: "running" });
    const dash = dashboardSchema.parse((await api.get("/api/dashboard").set(guard)).body);
    expect(dash).toMatchObject({ vehicles_today: 1, active_visits: 1, camera: { status: "running" } });
    expect(dash.tickets_by_status.open).toBe(1);
    expect(dash.unregistered_motorcycles.map((e) => e.plate_text)).toEqual(["ZZ999Z"]);
  });

  it("los eventos tienen el formato de contrato completo", async () => {
    const guard = await asGuard();
    await record(1, "AB123C");
    const items = (await api.get("/api/vehicle-events").set(guard)).body.items as unknown[];
    for (const item of items) vehicleEventSchema.parse(item);
  });
});
