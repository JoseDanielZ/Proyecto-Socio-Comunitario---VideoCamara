import type { VehicleType } from "@conjunto/contracts";
import { notFound } from "../../shared/errors";
import { normalizePlate, tryParsePlate } from "../visits/plate";

export interface VehicleEvent {
  id: number;
  cameraId: string;
  occurredAt: Date;
  vehicleType: VehicleType;
  color: string | null;
  plateText: string | null;
  plateConfidence: number | null;
  direction: string | null;
  trackerId: number | null;
  /** Nombre del archivo dentro de la carpeta de fotos (nunca una ruta). */
  snapshotFile: string | null;
}

export type NewVehicleEvent = Omit<VehicleEvent, "id">;

export interface EventFilter {
  start?: Date;
  end?: Date;
  /** Coincidencia parcial; se normaliza antes de buscar. */
  plate?: string;
  vehicleType?: VehicleType;
  color?: string;
  limit: number;
  offset: number;
}

export interface EventStore {
  add(event: NewVehicleEvent): Promise<VehicleEvent>;
  get(id: number): Promise<VehicleEvent | null>;
  search(filter: EventFilter): Promise<VehicleEvent[]>;
  count(filter: EventFilter): Promise<number>;
  /** Eventos con start <= occurredAt <= end, del más viejo al más nuevo. */
  between(start: Date, end: Date): Promise<VehicleEvent[]>;
}

export interface EventSummary {
  total: number;
  byType: Record<string, number>;
  byColor: Record<string, number>;
  /** Hora del día en UTC (0-23) -> cantidad. */
  byHour: Record<string, number>;
}

const tally = <T>(items: T[], key: (item: T) => string): Record<string, number> =>
  items.reduce<Record<string, number>>((acc, item) => {
    const k = key(item);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

export class EventsService {
  constructor(private readonly store: EventStore) {}

  /** Lo llama el motor de visión cada vez que un vehículo cruza la línea. */
  record(event: NewVehicleEvent): Promise<VehicleEvent> {
    // La placa que lee la cámara se guarda normalizada; una lectura basura se guarda como "sin placa".
    return this.store.add({ ...event, plateText: tryParsePlate(event.plateText) });
  }

  async get(id: number): Promise<VehicleEvent> {
    const event = await this.store.get(id);
    if (!event) throw notFound("Evento de cámara no encontrado");
    return event;
  }

  async list(filter: EventFilter): Promise<{ items: VehicleEvent[]; total: number }> {
    const criteria = { ...filter, plate: filter.plate ? normalizePlate(filter.plate) || undefined : undefined };
    const [items, total] = await Promise.all([this.store.search(criteria), this.store.count(criteria)]);
    return { items, total };
  }

  between(start: Date, end: Date): Promise<VehicleEvent[]> {
    return this.store.between(start, end);
  }

  async summary(start: Date, end: Date): Promise<EventSummary> {
    const events = await this.store.between(start, end);
    return {
      total: events.length,
      byType: tally(events, (e) => e.vehicleType),
      byColor: tally(events, (e) => e.color ?? "desconocido"),
      byHour: tally(events, (e) => String(e.occurredAt.getUTCHours())),
    };
  }
}
