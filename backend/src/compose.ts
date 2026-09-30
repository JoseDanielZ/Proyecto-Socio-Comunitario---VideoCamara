import type { Services } from "./app";
import type { Config } from "./config";
import type { Sql } from "./db";
import { AuthService } from "./modules/auth/auth.service";
import { BcryptHasher, JwtTokens } from "./modules/auth/security";
import { SqliteUserRepository } from "./modules/auth/users.repo";
import { CamerasService } from "./modules/cameras/cameras.service";
import { FrameHub } from "./modules/cameras/frame-hub";
import { SqliteTicketRepository } from "./modules/tickets/tickets.repo";
import { TicketsService } from "./modules/tickets/tickets.service";
import { SqliteEventRepository } from "./modules/vehicle-events/events.repo";
import { EventsService } from "./modules/vehicle-events/events.service";
import { ReconciliationService } from "./modules/visits/reconciliation.service";
import { SqliteVisitRepository } from "./modules/visits/visits.repo";
import { VisitsService } from "./modules/visits/visits.service";
import { systemClock, type Clock } from "./shared/time";

/**
 * Raíz de composición: el ÚNICO lugar que conoce las clases concretas (SQLite, bcrypt, JWT) y las
 * conecta con los servicios. Server y seed lo comparten; las pruebas lo usan con SQLite en memoria.
 */
export function buildServices(
  config: Config,
  sql: Sql,
  options: { clock?: Clock; hashRounds?: number } = {},
): Services {
  const clock = options.clock ?? systemClock;

  const auth = new AuthService(
    new SqliteUserRepository(sql),
    new BcryptHasher(options.hashRounds),
    new JwtTokens(config.jwtSecret, config.jwtExpiresMinutes),
  );
  const events = new EventsService(new SqliteEventRepository(sql));
  const visitStore = new SqliteVisitRepository(sql);
  const reconciliation = new ReconciliationService(visitStore, events);

  return {
    auth,
    events,
    reconciliation,
    visits: new VisitsService(visitStore, reconciliation, clock),
    tickets: new TicketsService(new SqliteTicketRepository(sql), auth, clock),
    cameras: new CamerasService([config.camera], new FrameHub(), clock),
  };
}
