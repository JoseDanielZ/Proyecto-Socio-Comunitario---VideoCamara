import { describe, expect, it } from "vitest";
import { levenshtein, normalizePlate, parsePlate, platesSimilar, tryParsePlate } from "../src/modules/visits/plate";
import { reconcile, unmatchedEvents, type SeenVehicle } from "../src/modules/visits/reconciliation";
import { creationEntry, withAssignee, withComment, withStatus, type Ticket } from "../src/modules/tickets/tickets.rules";
import { AppError } from "../src/shared/errors";

const T0 = new Date("2026-09-29T14:00:00Z");
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);
const seen = (over: Partial<SeenVehicle> & { id?: number } = {}): SeenVehicle => ({
  id: 1, occurredAt: T0, vehicleType: "motorcycle", plateText: null, ...over,
});
const moto = (plate: string | null, at = T0) => ({ plate, vehicleType: "motorcycle" as const, at });

describe("placas", () => {
  it("se normalizan", () => {
    expect(normalizePlate(" ab-123c ")).toBe("AB123C");
    expect(parsePlate("abc 1234")).toBe("ABC1234");
  });
  it("vacía es null; de largo inválido es error 422", () => {
    expect(parsePlate(null)).toBeNull();
    expect(parsePlate("  - ")).toBeNull();
    for (const raw of ["AB", "ABCDEFGHIJKL"]) expect(() => parsePlate(raw)).toThrow(AppError);
    expect(() => parsePlate("A")).toThrow(/Placa inválida/);
  });
  it("una lectura basura de cámara se trata como sin placa", () => {
    expect(tryParsePlate("??")).toBeNull();
    expect(tryParsePlate("ABC1234")).toBe("ABC1234");
  });
  it("distancia de edición", () => {
    expect(levenshtein("ABC1234", "ABC1234")).toBe(0);
    expect(levenshtein("ABC1234", "ABC1284")).toBe(1);
    expect(levenshtein("ABC1234", "ABC12")).toBe(2);
  });
  it("tolera un error y confusiones de OCR, pero no dos errores reales", () => {
    expect(platesSimilar("ABC1234", "ABC1284")).toBe(true);
    expect(platesSimilar("ABC1234", "A8C1234")).toBe(true); // B leída como 8
    expect(platesSimilar("ABC1234", "ABCI234")).toBe(true); // 1 leído como I
    expect(platesSimilar("ABC1234", "XYZ9999")).toBe(false);
    expect(platesSimilar("ABC1234", "ABC1299")).toBe(false);
  });
});

describe("conciliación con cámaras", () => {
  it("verified: misma placa dentro de la ventana", () => {
    const event = seen({ occurredAt: minutes(-2), plateText: "AB123C" });
    const result = reconcile(moto("AB123C"), [event]);
    expect(result.status).toBe("verified");
    expect(result.event).toBe(event);
  });
  it("verified con un carácter mal leído", () => {
    expect(reconcile(moto("AB123C"), [seen({ plateText: "AB128C" })]).status).toBe("verified");
  });
  it("elige el evento más cercano en el tiempo", () => {
    const far = seen({ id: 1, occurredAt: minutes(-8), plateText: "AB123C" });
    const near = seen({ id: 2, occurredAt: minutes(-1), plateText: "AB123C" });
    expect(reconcile(moto("AB123C"), [far, near]).event).toBe(near);
  });
  it("possible: mismo tipo pero placa ilegible", () => {
    const result = reconcile(moto("AB123C"), [seen({ id: 7, occurredAt: minutes(-1) })]);
    expect(result.status).toBe("possible");
    expect(result.event?.id).toBe(7);
  });
  it("possible: el guardia no dio placa y el tipo coincide", () => {
    expect(reconcile(moto(null), [seen()]).status).toBe("possible");
  });
  it("una lectura basura del OCR cuenta como sin placa", () => {
    expect(reconcile(moto("AB123C"), [seen({ plateText: "??" })]).status).toBe("possible");
  });
  it("no_camera_evidence: nada en la ventana", () => {
    const result = reconcile(moto("AB123C"), [seen({ occurredAt: minutes(-30), plateText: "AB123C" })]);
    expect(result.status).toBe("no_camera_evidence");
    expect(result.event).toBeNull();
  });
  it("no_camera_evidence: la cámara solo vio otra placa (y lo dice)", () => {
    const result = reconcile(moto("AB123C"), [seen({ plateText: "ZZZ9999", vehicleType: "car" })]);
    expect(result.status).toBe("no_camera_evidence");
    expect(result.reason).toContain("ZZZ9999");
  });
  it("otro tipo de vehículo sin placa no es coincidencia y el motivo dice qué vio", () => {
    const result = reconcile(moto("AB123C"), [seen({ vehicleType: "car" })]);
    expect(result.status).toBe("no_camera_evidence");
    expect(result.reason).toContain("car");
    expect(result.reason).not.toContain("otra placa");
  });
  it("visita a pie: no aplica", () => {
    expect(reconcile({ plate: null, vehicleType: null, at: T0 }, [seen()]).status).toBe("not_applicable");
  });
  it("el borde de la ventana es inclusivo", () => {
    expect(reconcile(moto("AB123C"), [seen({ occurredAt: minutes(-10), plateText: "AB123C" })]).status).toBe("verified");
    const late = seen({ occurredAt: new Date(minutes(-10).getTime() - 1000), plateText: "AB123C" });
    expect(reconcile(moto("AB123C"), [late]).status).toBe("no_camera_evidence");
  });
  it("la ventana es configurable", () => {
    const event = seen({ occurredAt: minutes(-3), plateText: "AB123C" });
    expect(reconcile(moto("AB123C"), [event], 2 * 60_000).status).toBe("no_camera_evidence");
  });
});

describe("vehículos sin registrar", () => {
  const visit = (plate: string | null, at = T0, cameraEventId: number | null = null) => ({
    ...moto(plate, at), cameraEventId,
  });
  it("lista los que ninguna visita explica", () => {
    const registered = seen({ id: 1, plateText: "AB123C" });
    const ghost = seen({ id: 2, occurredAt: minutes(30), plateText: "ZZ999Z" });
    expect(unmatchedEvents([registered, ghost], [visit("AB123C")]).map((e) => e.id)).toEqual([2]);
  });
  it("un evento confirmado por el guardia queda explicado aunque esté fuera de la ventana", () => {
    const far = seen({ id: 5, occurredAt: minutes(40) });
    expect(unmatchedEvents([far], [visit("AB123C", T0, 5)])).toEqual([]);
  });
});

describe("reglas de ticket", () => {
  const base = (): Ticket => ({
    id: 1, code: "TCK-0001", title: "x", description: "d", category: "other", priority: "medium",
    status: "open", location: null, reporterName: null, reporterContact: null, createdBy: 1,
    assignedTo: null, createdAt: T0, updatedAt: T0, resolvedAt: null, entries: [creationEntry(1, T0, "d")],
  });

  it("el flujo normal deja historial y marca la resolución", () => {
    let t = withAssignee(base(), 2, 1, minutes(1));
    t = withStatus(t, "in_progress", 1, minutes(2));
    t = withComment(t, "  Se pidió el repuesto  ", 1, minutes(3));
    t = withStatus(t, "resolved", 1, minutes(60));
    expect(t.status).toBe("resolved");
    expect(t.resolvedAt).toEqual(minutes(60));
    expect(t.entries.map((e) => e.kind)).toEqual(["created", "assignment", "status_change", "comment", "status_change"]);
    expect(t.entries[3]?.body).toBe("Se pidió el repuesto");
    expect(t.entries.at(-1)).toMatchObject({ fromStatus: "in_progress", toStatus: "resolved" });
  });
  it("no muta el ticket original", () => {
    const original = base();
    withStatus(original, "in_progress", 1, minutes(1));
    expect(original.status).toBe("open");
    expect(original.entries).toHaveLength(1);
  });
  it("rechaza transiciones inválidas y repetidas con 409", () => {
    expect(() => withStatus(base(), "resolved", 1, T0)).toThrow(/No se puede pasar de 'open' a 'resolved'/);
    expect(() => withStatus(base(), "open", 1, T0)).toThrow(/ya está en estado/);
    try {
      withStatus(base(), "resolved", 1, T0);
    } catch (e) {
      expect((e as AppError).status).toBe(409);
    }
  });
  it("cerrado es final: no admite cambios, asignación ni comentarios", () => {
    const closed = withStatus(base(), "closed", 1, minutes(1));
    expect(() => withStatus(closed, "open", 1, T0)).toThrow(AppError);
    expect(() => withAssignee(closed, 2, 1, T0)).toThrow(/cerrado/);
    expect(() => withComment(closed, "tarde", 1, T0)).toThrow(/cerrado/);
  });
  it("reabrir un ticket resuelto borra la fecha de resolución", () => {
    let t = withStatus(base(), "in_progress", 1, minutes(1));
    t = withStatus(t, "resolved", 1, minutes(2));
    expect(withStatus(t, "in_progress", 1, minutes(3)).resolvedAt).toBeNull();
  });
  it("un comentario vacío es inválido (422)", () => {
    expect(() => withComment(base(), "   ", 1, T0)).toThrow(/vacío/);
  });
});
