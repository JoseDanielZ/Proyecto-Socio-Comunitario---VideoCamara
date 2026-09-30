/**
 * Las MISMAS pruebas corren contra el repositorio en memoria y contra el de SQLite: si ambos pasan,
 * son intercambiables y los servicios no notan la diferencia (sustitución de Liskov).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { creationEntry, withComment, withStatus, type Ticket } from "../src/modules/tickets/tickets.rules";
import type { Visit } from "../src/modules/visits/visits.service";
import { implementations, minutes, newEvent, T0 } from "./support/helpers";

describe.each(Object.entries(implementations))("repositorios (%s)", (_name, make) => {
  let repos: ReturnType<typeof make>;
  beforeEach(() => {
    repos = make();
  });
  afterEach(() => repos.close());

  const addUser = (username = "admin") =>
    repos.users.add({ username, fullName: username.toUpperCase(), role: "admin", passwordHash: "h", isActive: true });

  describe("usuarios", () => {
    it("guarda, busca por id y por nombre, lista y actualiza", async () => {
      const a = await addUser("admin");
      await addUser("guardia1");
      expect((await repos.users.get(a.id))?.username).toBe("admin");
      expect((await repos.users.getByUsername("guardia1"))?.fullName).toBe("GUARDIA1");
      expect(await repos.users.get(999)).toBeNull();
      expect(await repos.users.getByUsername("nadie")).toBeNull();
      expect((await repos.users.list()).map((u) => u.username)).toEqual(["admin", "guardia1"]);
      await repos.users.update({ ...a, isActive: false, fullName: "Otro" });
      expect(await repos.users.get(a.id)).toMatchObject({ isActive: false, fullName: "Otro" });
    });
  });

  describe("eventos de cámara", () => {
    it("guarda y conserva fechas con su instante exacto", async () => {
      const saved = await repos.events.add(newEvent({ plateText: "AB123C", color: "rojo", trackerId: 7, snapshotFile: "a.jpg" }));
      const loaded = await repos.events.get(saved.id);
      expect(loaded).toEqual(saved);
      expect(loaded?.occurredAt.getTime()).toBe(T0.getTime());
      expect(await repos.events.get(999)).toBeNull();
    });

    it("filtra por tipo, color, placa parcial y fechas; ordena del más nuevo al más viejo", async () => {
      await repos.events.add(newEvent({ occurredAt: T0, plateText: "AB123C", color: "negro" }));
      await repos.events.add(newEvent({ occurredAt: new Date(T0.getTime() + minutes(60)), vehicleType: "car", color: "blanco" }));
      await repos.events.add(newEvent({ occurredAt: new Date(T0.getTime() + minutes(65)), vehicleType: "car", color: "blanco" }));
      const base = { limit: 50, offset: 0 };

      expect(await repos.events.count({ ...base, vehicleType: "car" })).toBe(2);
      expect((await repos.events.search({ ...base, color: "negro" }))[0]?.plateText).toBe("AB123C");
      expect(await repos.events.count({ ...base, plate: "B123" })).toBe(1);
      expect(await repos.events.count({ ...base, start: new Date(T0.getTime() + minutes(30)) })).toBe(2);
      expect(await repos.events.count({ ...base, end: new Date(T0.getTime() + minutes(30)) })).toBe(1);
      const all = await repos.events.search(base);
      expect(all[0]!.occurredAt.getTime()).toBeGreaterThan(all.at(-1)!.occurredAt.getTime());
    });

    it("pagina", async () => {
      for (let i = 0; i < 5; i++) await repos.events.add(newEvent({ occurredAt: new Date(T0.getTime() + minutes(i)) }));
      const second = await repos.events.search({ limit: 2, offset: 2 });
      expect(second).toHaveLength(2);
      expect(await repos.events.count({ limit: 2, offset: 2 })).toBe(5);
    });

    it("between es inclusivo en los dos extremos y va del más viejo al más nuevo", async () => {
      await repos.events.add(newEvent({ occurredAt: new Date(T0.getTime() + minutes(10)) }));
      await repos.events.add(newEvent({ occurredAt: T0 }));
      await repos.events.add(newEvent({ occurredAt: new Date(T0.getTime() + minutes(20)) }));
      const inside = await repos.events.between(T0, new Date(T0.getTime() + minutes(10)));
      expect(inside.map((e) => e.occurredAt.getTime())).toEqual([T0.getTime(), T0.getTime() + minutes(10)]);
    });
  });

  describe("visitas", () => {
    const visit = (registeredBy: number, over: Partial<Visit> = {}): Omit<Visit, "id"> => ({
      visitType: "delivery", fullName: "Carlos Pérez", documentId: null, company: "Uber", plate: "AB123C",
      vehicleType: "motorcycle", destination: "Casa 5", hostName: null, notes: null, enteredAt: T0,
      exitedAt: null, registeredBy, cameraEventId: null, matchStatus: "no_camera_evidence", ...over,
    });

    it("guarda, actualiza y conserva los campos", async () => {
      const guard = await addUser("g");
      const event = await repos.events.add(newEvent());
      const saved = await repos.visits.add(visit(guard.id));
      expect(await repos.visits.get(saved.id)).toEqual(saved);
      const updated = await repos.visits.update({
        ...saved, exitedAt: new Date(T0.getTime() + minutes(30)), cameraEventId: event.id, matchStatus: "verified",
      });
      expect(await repos.visits.get(saved.id)).toEqual(updated);
      expect(await repos.visits.get(999)).toBeNull();
    });

    it("filtra por dentro/salieron, tipo y texto; ordena por ingreso descendente", async () => {
      const g = await addUser("g");
      await repos.visits.add(visit(g.id, { fullName: "Ana Torres", company: null, plate: null, vehicleType: null, visitType: "visitor", destination: "Casa 2" }));
      const uber = await repos.visits.add(visit(g.id, { enteredAt: new Date(T0.getTime() + minutes(5)) }));
      await repos.visits.update({ ...uber, exitedAt: new Date(T0.getTime() + minutes(9)) });
      const base = { limit: 50, offset: 0 };

      expect(await repos.visits.count({ ...base, activeOnly: true })).toBe(1);
      expect(await repos.visits.count({ ...base, activeOnly: false })).toBe(1);
      expect(await repos.visits.count({ ...base, visitType: "delivery" })).toBe(1);
      expect(await repos.visits.count({ ...base, search: "uber" })).toBe(1);
      expect(await repos.visits.count({ ...base, search: "ab123" })).toBe(1);
      expect(await repos.visits.count({ ...base, search: "casa 2" })).toBe(1);
      expect((await repos.visits.search(base))[0]!.id).toBe(uber.id);
    });

    it("withVehicleBetween solo trae visitas con vehículo dentro del rango", async () => {
      const g = await addUser("g");
      await repos.visits.add(visit(g.id));
      await repos.visits.add(visit(g.id, { plate: null, vehicleType: null, visitType: "visitor" }));
      await repos.visits.add(visit(g.id, { enteredAt: new Date(T0.getTime() + minutes(120)) }));
      const found = await repos.visits.withVehicleBetween(new Date(T0.getTime() - minutes(1)), new Date(T0.getTime() + minutes(1)));
      expect(found).toHaveLength(1);
    });
  });

  describe("tickets", () => {
    const draft = (createdBy: number, over: Partial<Ticket> = {}): Omit<Ticket, "id" | "code"> => ({
      title: "Fuga de agua", description: "Junto a la piscina", category: "damage", priority: "urgent",
      status: "open", location: "Piscina", reporterName: null, reporterContact: null, createdBy,
      assignedTo: null, createdAt: T0, updatedAt: T0, resolvedAt: null,
      entries: [creationEntry(createdBy, T0, "Junto a la piscina")], ...over,
    });

    it("asigna código correlativo e id a las entradas del historial", async () => {
      const u = await addUser();
      const first = await repos.tickets.add(draft(u.id));
      const second = await repos.tickets.add(draft(u.id, { title: "Otro" }));
      expect([first.code, second.code]).toEqual(["TCK-0001", "TCK-0002"]);
      expect(first.entries[0]?.id).toBeTypeOf("number");
      expect(first.entries[0]).toMatchObject({ kind: "created", body: "Junto a la piscina" });
    });

    it("save agrega solo las entradas nuevas y no duplica las anteriores", async () => {
      const u = await addUser();
      const t = await repos.tickets.add(draft(u.id));
      const changed = withStatus(t, "in_progress", u.id, new Date(T0.getTime() + minutes(1)));
      const commented = withComment(changed, "Ya voy", u.id, new Date(T0.getTime() + minutes(2)));
      const saved = await repos.tickets.save(commented);
      expect(saved.entries.map((e) => e.kind)).toEqual(["created", "status_change", "comment"]);
      // guardar otra vez lo mismo no duplica
      expect((await repos.tickets.save(saved)).entries).toHaveLength(3);
      expect(await repos.tickets.get(t.id)).toEqual(saved);
      expect(await repos.tickets.get(999)).toBeNull();
    });

    it("filtra, cuenta por estado y ordena por última actualización", async () => {
      const u = await addUser();
      const a = await repos.tickets.add(draft(u.id));
      await repos.tickets.add(draft(u.id, { title: "Ruido fuerte", category: "noise", priority: "low", location: "Casa 14", updatedAt: new Date(T0.getTime() + minutes(5)) }));
      await repos.tickets.save(withStatus(a, "in_progress", u.id, new Date(T0.getTime() + minutes(9))));
      const base = { limit: 50, offset: 0 };

      expect(await repos.tickets.count({ ...base, status: "in_progress" })).toBe(1);
      expect(await repos.tickets.count({ ...base, category: "noise" })).toBe(1);
      expect(await repos.tickets.count({ ...base, priority: "urgent" })).toBe(1);
      expect(await repos.tickets.count({ ...base, search: "casa 14" })).toBe(1);
      expect(await repos.tickets.count({ ...base, search: "tck-0001" })).toBe(1);
      expect((await repos.tickets.search(base))[0]!.status).toBe("in_progress"); // el actualizado más reciente
      expect(await repos.tickets.countsByStatus()).toEqual({ open: 1, in_progress: 1 });
    });
  });
});
