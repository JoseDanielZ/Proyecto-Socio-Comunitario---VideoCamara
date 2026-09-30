import type { VehicleType } from "@conjunto/contracts";
import { notFound } from "../../shared/errors";
import type { VehicleEvent } from "../vehicle-events/events.service";
import {
  DEFAULT_WINDOW_MS,
  reconcile,
  unmatchedEvents,
  type DeclaredVehicle,
  type MatchResult,
} from "./reconciliation";
import type { CameraMatcher, Visit, VisitStore, VisitWithMatch } from "./visits.service";

/** Lo que se necesita de los eventos: buscar por ventana de tiempo y por id (no el repositorio completo). */
export interface EventLookup {
  between(start: Date, end: Date): Promise<VehicleEvent[]>;
  get(id: number): Promise<VehicleEvent>;
}

type Visits = Pick<VisitStore, "get" | "update" | "withVehicleBetween">;

/** Compara lo que declaran los guardias con lo que vieron las cámaras. */
export class ReconciliationService implements CameraMatcher {
  constructor(
    private readonly visits: Visits,
    private readonly events: EventLookup,
    private readonly windowMs = DEFAULT_WINDOW_MS,
  ) {}

  async compare(declared: DeclaredVehicle): Promise<MatchResult<VehicleEvent>> {
    const events = await this.events.between(
      new Date(declared.at.getTime() - this.windowMs),
      new Date(declared.at.getTime() + this.windowMs),
    );
    return reconcile(declared, events, this.windowMs);
  }

  private async visit(id: number): Promise<Visit> {
    const visit = await this.visits.get(id);
    if (!visit) throw notFound("Visita no encontrada");
    return visit;
  }

  /**
   * Vuelve a comparar con las cámaras y guarda el resultado. Sirve cuando la cámara procesó el
   * vehículo después de que el guardia lo registró.
   */
  async recheck(visitId: number): Promise<VisitWithMatch> {
    const visit = await this.visit(visitId);
    if (visit.matchStatus === "verified" && visit.cameraEventId !== null) {
      const event = await this.events.get(visit.cameraEventId).catch(() => null);
      if (event) {
        return { visit, match: { status: "verified", event, reason: "Ya se comprobó con la cámara" } };
      }
    }
    const match = await this.compare({ plate: visit.plate, vehicleType: visit.vehicleType, at: visit.enteredAt });
    const updated = await this.visits.update({
      ...visit, matchStatus: match.status, cameraEventId: match.event?.id ?? null,
    });
    return { visit: updated, match };
  }

  /** El guardia mira la foto de una coincidencia "possible" y la confirma. */
  async confirm(visitId: number, eventId: number): Promise<VisitWithMatch> {
    const visit = await this.visit(visitId);
    const event = await this.events.get(eventId); // 404 si no existe
    const updated = await this.visits.update({ ...visit, cameraEventId: event.id, matchStatus: "verified" });
    return { visit: updated, match: { status: "verified", event, reason: "Confirmado por el guardia" } };
  }

  /** Vehículos que la cámara vio y ningún guardia registró (p. ej. motos de delivery). */
  async unmatched(start: Date, end: Date, vehicleType?: VehicleType): Promise<VehicleEvent[]> {
    const seen = (await this.events.between(start, end)).filter((e) => !vehicleType || e.vehicleType === vehicleType);
    const visits = await this.visits.withVehicleBetween(
      new Date(start.getTime() - this.windowMs),
      new Date(end.getTime() + this.windowMs),
    );
    return unmatchedEvents(
      seen,
      visits.map((v) => ({ plate: v.plate, vehicleType: v.vehicleType, at: v.enteredAt, cameraEventId: v.cameraEventId })),
      this.windowMs,
    );
  }
}
