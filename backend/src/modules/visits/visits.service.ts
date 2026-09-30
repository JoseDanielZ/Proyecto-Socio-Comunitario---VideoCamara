import type { MatchStatus, NewVisit, VehicleType, VisitType } from "@conjunto/contracts";
import { conflict, invalid, notFound } from "../../shared/errors";
import { systemClock, type Clock } from "../../shared/time";
import type { VehicleEvent } from "../vehicle-events/events.service";
import { parsePlate } from "./plate";
import type { DeclaredVehicle, MatchResult } from "./reconciliation";

export interface Visit {
  id: number;
  visitType: VisitType;
  fullName: string;
  documentId: string | null;
  company: string | null;
  /** Placa normalizada. */
  plate: string | null;
  vehicleType: VehicleType | null;
  destination: string | null;
  hostName: string | null;
  notes: string | null;
  enteredAt: Date;
  exitedAt: Date | null;
  registeredBy: number;
  /** Evento de cámara que respalda el ingreso. */
  cameraEventId: number | null;
  matchStatus: MatchStatus;
}

export interface VisitFilter {
  activeOnly?: boolean;
  visitType?: VisitType;
  start?: Date;
  end?: Date;
  /** Nombre, placa, empresa o destino. */
  search?: string;
  limit: number;
  offset: number;
}

export interface VisitStore {
  add(visit: Omit<Visit, "id">): Promise<Visit>;
  get(id: number): Promise<Visit | null>;
  update(visit: Visit): Promise<Visit>;
  search(filter: VisitFilter): Promise<Visit[]>;
  count(filter: VisitFilter): Promise<number>;
  /** Visitas con vehículo (placa o tipo) cuyo ingreso cae entre start y end. */
  withVehicleBetween(start: Date, end: Date): Promise<Visit[]>;
}

/** Lo único que registrar un ingreso necesita de la comparación con cámaras. */
export interface CameraMatcher {
  compare(declared: DeclaredVehicle): Promise<MatchResult<VehicleEvent>>;
}

export interface VisitWithMatch {
  visit: Visit;
  match: MatchResult<VehicleEvent>;
}

const clean = (v: string | null | undefined) => v?.trim() || null;

/** Registro de ingresos y salidas. Comparar con cámaras es otra responsabilidad (ReconciliationService). */
export class VisitsService {
  constructor(
    private readonly store: VisitStore,
    private readonly matcher: CameraMatcher,
    private readonly clock: Clock = systemClock,
  ) {}

  async registerEntry(guardId: number, input: NewVisit): Promise<VisitWithMatch> {
    const fullName = clean(input.full_name);
    if (!fullName) throw invalid("El nombre es obligatorio");
    const plate = parsePlate(input.plate);
    // Una placa implica vehículo; si el guardia no dijo cuál, se asume auto.
    const vehicleType = input.vehicle_type ?? (plate ? "car" : null);
    const enteredAt = this.clock();

    const match = await this.matcher.compare({ plate, vehicleType, at: enteredAt });
    const visit = await this.store.add({
      visitType: input.visit_type,
      fullName,
      documentId: clean(input.document_id),
      company: clean(input.company),
      plate,
      vehicleType,
      destination: clean(input.destination),
      hostName: clean(input.host_name),
      notes: clean(input.notes),
      enteredAt,
      exitedAt: null,
      registeredBy: guardId,
      cameraEventId: match.event?.id ?? null,
      matchStatus: match.status,
    });
    return { visit, match };
  }

  async registerExit(id: number): Promise<Visit> {
    const visit = await this.get(id);
    if (visit.exitedAt) throw conflict("Esta visita ya tiene salida registrada");
    return this.store.update({ ...visit, exitedAt: this.clock() });
  }

  async get(id: number): Promise<Visit> {
    const visit = await this.store.get(id);
    if (!visit) throw notFound("Visita no encontrada");
    return visit;
  }

  async list(filter: VisitFilter): Promise<{ items: Visit[]; total: number }> {
    const [items, total] = await Promise.all([this.store.search(filter), this.store.count(filter)]);
    return { items, total };
  }
}
