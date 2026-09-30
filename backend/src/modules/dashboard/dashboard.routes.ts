import { Router } from "express";
import type { Dashboard } from "@conjunto/contracts";
import { requireSession, type Authenticator } from "../../shared/http";
import { HOUR_MS } from "../../shared/time";
import type { CamerasService } from "../cameras/cameras.service";
import type { ReconciliationService } from "../visits/reconciliation.service";
import { toEventDto } from "../vehicle-events/events.routes";
import type { EventsService } from "../vehicle-events/events.service";
import type { VisitsService } from "../visits/visits.service";
import type { TicketsService } from "../tickets/tickets.service";

export interface DashboardDeps {
  events: Pick<EventsService, "summary">;
  visits: Pick<VisitsService, "list">;
  tickets: Pick<TicketsService, "countsByStatus">;
  reconciliation: Pick<ReconciliationService, "unmatched">;
  cameras: Pick<CamerasService, "list">;
  localUtcOffsetHours: number;
}

/** Inicio del día actual en la zona horaria del conjunto, expresado como instante UTC. */
export function startOfLocalDay(now: Date, utcOffsetHours: number): Date {
  const shifted = new Date(now.getTime() + utcOffsetHours * HOUR_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - utcOffsetHours * HOUR_MS);
}

export function dashboardRoutes(deps: DashboardDeps, auth: Authenticator): Router {
  const router = Router();

  router.get("/dashboard", requireSession(auth), async (_req, res) => {
    const now = new Date();
    const [today, activeVisits, tickets, unregistered] = await Promise.all([
      deps.events.summary(startOfLocalDay(now, deps.localUtcOffsetHours), now),
      deps.visits.list({ activeOnly: true, limit: 1, offset: 0 }),
      deps.tickets.countsByStatus(),
      deps.reconciliation.unmatched(new Date(now.getTime() - 2 * HOUR_MS), now, "motorcycle"),
    ]);
    const body: Dashboard = {
      vehicles_today: today.total,
      vehicles_today_by_type: today.byType,
      active_visits: activeVisits.total,
      tickets_by_status: tickets,
      unregistered_motorcycles: unregistered.reverse().map(toEventDto),
      camera: deps.cameras.list()[0] ?? null,
    };
    res.json(body);
  });

  return router;
}
