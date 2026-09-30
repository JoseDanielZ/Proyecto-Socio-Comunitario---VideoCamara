import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Config } from "./config";
import { authRoutes } from "./modules/auth/auth.routes";
import type { AuthService } from "./modules/auth/auth.service";
import { camerasRoutes } from "./modules/cameras/cameras.routes";
import type { CamerasService } from "./modules/cameras/cameras.service";
import { ingestRoutes } from "./modules/cameras/ingest.routes";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes";
import { ticketsRoutes } from "./modules/tickets/tickets.routes";
import type { TicketsService } from "./modules/tickets/tickets.service";
import { eventsRoutes } from "./modules/vehicle-events/events.routes";
import type { EventsService } from "./modules/vehicle-events/events.service";
import type { ReconciliationService } from "./modules/visits/reconciliation.service";
import { visitsRoutes } from "./modules/visits/visits.routes";
import type { VisitsService } from "./modules/visits/visits.service";
import { errorHandler } from "./shared/http";

export interface Services {
  auth: AuthService;
  tickets: TicketsService;
  visits: VisitsService;
  reconciliation: ReconciliationService;
  events: EventsService;
  cameras: CamerasService;
}

/** Arma la aplicación HTTP. No crea nada: recibe todo ya construido (ver compose.ts). */
export function createApp(config: Config, s: Services): Express {
  const app = express();
  app.disable("x-powered-by");
  // Las imágenes y el video se piden desde otro origen en desarrollo (el front en :5173).
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: "100kb" }));

  const api = express.Router();
  api.get("/health", (_req, res) => void res.json({ status: "ok" }));
  api.use(authRoutes(s.auth, { loginMaxAttempts: config.loginMaxAttempts }));
  api.use(camerasRoutes(s.cameras, s.auth));
  api.use(ingestRoutes(s.events, s.cameras, config.ingestApiKey));
  api.use(eventsRoutes(s.events, s.auth, { snapshotsDir: config.snapshotsDir }));
  api.use(visitsRoutes(s.visits, s.reconciliation, s.auth));
  api.use(ticketsRoutes(s.tickets, s.auth, s.auth));
  api.use(
    dashboardRoutes(
      {
        events: s.events, visits: s.visits, tickets: s.tickets, reconciliation: s.reconciliation,
        cameras: s.cameras, localUtcOffsetHours: config.localUtcOffsetHours,
      },
      s.auth,
    ),
  );
  api.use((_req, res) => void res.status(404).json({ detail: "Ruta no encontrada" }));

  app.use("/api", api);
  app.use(errorHandler);
  return app;
}
