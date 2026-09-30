import { openDatabase, type Sql } from "../../src/db";
import type { Config } from "../../src/config";
import type { NewVehicleEvent } from "../../src/modules/vehicle-events/events.service";
import { MemoryEventRepository, MemoryTicketRepository, MemoryUserRepository, MemoryVisitRepository } from "./memory-repos";
import { SqliteEventRepository } from "../../src/modules/vehicle-events/events.repo";
import { SqliteTicketRepository } from "../../src/modules/tickets/tickets.repo";
import { SqliteUserRepository } from "../../src/modules/auth/users.repo";
import { SqliteVisitRepository } from "../../src/modules/visits/visits.repo";

export const T0 = new Date("2026-09-29T14:00:00.000Z");

/** Reloj controlable para probar ventanas de tiempo sin esperar. */
export class FakeClock {
  constructor(public now: Date = T0) {}
  readonly read = () => this.now;
  advance(ms: number) {
    this.now = new Date(this.now.getTime() + ms);
  }
}

export const minutes = (n: number) => n * 60_000;

export const testConfig = (over: Partial<Config> = {}): Config => ({
  port: 0,
  databasePath: ":memory:",
  jwtSecret: "test-secret-test-secret-test-secret-32",
  jwtExpiresMinutes: 60,
  corsOrigins: ["http://localhost:5173"],
  localUtcOffsetHours: -5,
  camera: { id: "entrada", name: "Entrada principal" },
  snapshotsDir: "",
  ingestApiKey: "clave-de-ingesta-de-pruebas",
  loginMaxAttempts: 100,
  production: false,
  ...over,
});

export function newEvent(over: Partial<NewVehicleEvent> = {}): NewVehicleEvent {
  return {
    cameraId: "entrada", occurredAt: T0, vehicleType: "motorcycle", color: "negro", plateText: null,
    plateConfidence: null, direction: null, trackerId: null, snapshotFile: null, ...over,
  };
}

/** Las dos implementaciones de cada repositorio, para correr las mismas pruebas contra ambas. */
export const implementations = {
  memory: () => ({
    users: new MemoryUserRepository(), events: new MemoryEventRepository(),
    visits: new MemoryVisitRepository(), tickets: new MemoryTicketRepository(), close: () => {},
  }),
  sqlite: () => {
    const sql: Sql = openDatabase(":memory:");
    return {
      users: new SqliteUserRepository(sql), events: new SqliteEventRepository(sql),
      visits: new SqliteVisitRepository(sql), tickets: new SqliteTicketRepository(sql), close: () => sql.close(),
    };
  },
};
