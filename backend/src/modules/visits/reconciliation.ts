/** Conciliación de visitas con lo que vieron las cámaras. Reglas puras: sin base de datos ni reloj. */
import type { MatchStatus, VehicleType } from "@conjunto/contracts";
import { MINUTE_MS } from "../../shared/time";
import { platesSimilar, tryParsePlate } from "./plate";

export const DEFAULT_WINDOW_MS = 10 * MINUTE_MS;

/** Lo mínimo que se necesita saber de un cruce de cámara (un VehicleEvent completo lo cumple). */
export interface SeenVehicle {
  id: number;
  occurredAt: Date;
  vehicleType: VehicleType;
  plateText: string | null;
}

/** Lo que el guardia declaró de un vehículo que ingresa. */
export interface DeclaredVehicle {
  plate: string | null;
  vehicleType: VehicleType | null;
  at: Date;
}

export interface MatchResult<E extends SeenVehicle = SeenVehicle> {
  status: MatchStatus;
  event: E | null;
  reason: string;
}

const closest = <E extends SeenVehicle>(events: E[], at: Date): E =>
  events.reduce((best, e) =>
    Math.abs(e.occurredAt.getTime() - at.getTime()) < Math.abs(best.occurredAt.getTime() - at.getTime()) ? e : best,
  );

/**
 * Decide si las cámaras respaldan el ingreso de un vehículo.
 * - verified: hay un evento en la ventana con la misma placa (tolera 1 carácter mal leído).
 * - possible: la placa no coincide pero hay un evento del mismo tipo con placa ilegible; el guardia
 *   debe confirmarlo mirando la foto.
 * - no_camera_evidence: nada en la ventana, o solo vehículos con otra placa legible.
 */
export function reconcile<E extends SeenVehicle>(
  declared: DeclaredVehicle,
  events: readonly E[],
  windowMs = DEFAULT_WINDOW_MS,
): MatchResult<E> {
  const { plate, vehicleType, at } = declared;
  if (plate === null && vehicleType === null) {
    return { status: "not_applicable", event: null, reason: "Ingreso sin vehículo" };
  }

  const nearby = events.filter((e) => Math.abs(e.occurredAt.getTime() - at.getTime()) <= windowMs);
  if (nearby.length === 0) {
    return {
      status: "no_camera_evidence",
      event: null,
      reason: `La cámara no registró ningún vehículo en ±${Math.floor(windowMs / MINUTE_MS)} min`,
    };
  }

  if (plate !== null) {
    const samePlate = nearby.filter((e) => {
      const seen = tryParsePlate(e.plateText);
      return seen !== null && platesSimilar(seen, plate);
    });
    if (samePlate.length > 0) {
      return { status: "verified", event: closest(samePlate, at), reason: "La cámara leyó esta placa" };
    }
  }

  const unreadableSameType = nearby.filter(
    (e) => tryParsePlate(e.plateText) === null && (vehicleType === null || e.vehicleType === vehicleType),
  );
  if (unreadableSameType.length > 0) {
    return {
      status: "possible",
      event: closest(unreadableSameType, at),
      reason: "La cámara vio un vehículo del mismo tipo pero no pudo leer la placa; confirmar con la foto",
    };
  }

  const otherPlates = [...new Set(nearby.map((e) => e.plateText).filter((p): p is string => !!p))].sort();
  const reason = otherPlates.length
    ? `La cámara solo vio vehículos con otra placa (vio: ${otherPlates.join(", ")})`
    : `La cámara vio vehículos (${[...new Set(nearby.map((e) => e.vehicleType))].sort().join(", ")}) pero ninguno del tipo registrado`;
  return { status: "no_camera_evidence", event: null, reason };
}

export interface RegisteredVisit extends DeclaredVehicle {
  cameraEventId: number | null;
}

/** Vehículos que la cámara vio cruzar y ninguna visita registrada explica. */
export function unmatchedEvents<E extends SeenVehicle>(
  events: readonly E[],
  visits: readonly RegisteredVisit[],
  windowMs = DEFAULT_WINDOW_MS,
): E[] {
  return events.filter(
    (event) =>
      !visits.some(
        (visit) =>
          visit.cameraEventId === event.id ||
          ["verified", "possible"].includes(reconcile(visit, [event], windowMs).status),
      ),
  );
}
