import { Router } from "express";
import {
  confirmEventSchema,
  newVisitSchema,
  unmatchedQuerySchema,
  visitQuerySchema,
  type Visit as VisitDto,
  type VisitWithMatch as VisitWithMatchDto,
} from "@conjunto/contracts";
import { invalid } from "../../shared/errors";
import { currentUser, parse, requireSession, type Authenticator } from "../../shared/http";
import { HOUR_MS } from "../../shared/time";
import { toEventDto } from "../vehicle-events/events.routes";
import type { ReconciliationService } from "./reconciliation.service";
import type { VisitsService, Visit, VisitWithMatch } from "./visits.service";

export const toVisitDto = (v: Visit): VisitDto => ({
  id: v.id,
  visit_type: v.visitType,
  full_name: v.fullName,
  document_id: v.documentId,
  company: v.company,
  plate: v.plate,
  vehicle_type: v.vehicleType,
  destination: v.destination,
  host_name: v.hostName,
  notes: v.notes,
  entered_at: v.enteredAt.toISOString(),
  exited_at: v.exitedAt?.toISOString() ?? null,
  is_active: v.exitedAt === null,
  registered_by: v.registeredBy,
  camera_event_id: v.cameraEventId,
  match_status: v.matchStatus,
});

export const toVisitWithMatchDto = ({ visit, match }: VisitWithMatch): VisitWithMatchDto => ({
  visit: toVisitDto(visit),
  camera_match: { status: match.status, reason: match.reason, event: match.event ? toEventDto(match.event) : null },
});

export function visitsRoutes(visits: VisitsService, reconciliation: ReconciliationService, auth: Authenticator): Router {
  const router = Router();
  router.use("/visits", requireSession(auth));

  const idOf = (raw: string | string[] | undefined): number => {
    const id = Number(raw);
    if (!Number.isInteger(id)) throw invalid("Identificador de visita inválido");
    return id;
  };

  /** Registra el ingreso y lo compara al instante con lo que vieron las cámaras. */
  router.post("/visits", async (req, res) => {
    const result = await visits.registerEntry(currentUser(req).id, parse(newVisitSchema, req.body));
    res.status(201).json(toVisitWithMatchDto(result));
  });

  router.get("/visits", async (req, res) => {
    const q = parse(visitQuerySchema, req.query);
    const page = await visits.list({
      activeOnly: q.active, visitType: q.type, start: q.from, end: q.to, search: q.q, limit: q.limit, offset: q.offset,
    });
    res.json({ items: page.items.map(toVisitDto), total: page.total });
  });

  // Antes de "/visits/:id" para que "unmatched-vehicles" no se lea como un id.
  router.get("/visits/unmatched-vehicles", async (req, res) => {
    const q = parse(unmatchedQuerySchema, req.query);
    const end = new Date();
    const events = await reconciliation.unmatched(new Date(end.getTime() - q.hours * HOUR_MS), end, q.type);
    res.json(events.reverse().map(toEventDto)); // los más recientes primero
  });

  router.get("/visits/:id", async (req, res) => {
    res.json(toVisitDto(await visits.get(idOf(req.params.id))));
  });

  router.patch("/visits/:id/exit", async (req, res) => {
    res.json(toVisitDto(await visits.registerExit(idOf(req.params.id))));
  });

  /** Vuelve a comparar con las cámaras (útil si el vehículo se procesó después del registro). */
  router.get("/visits/:id/camera-match", async (req, res) => {
    res.json(toVisitWithMatchDto(await reconciliation.recheck(idOf(req.params.id))));
  });

  /** El guardia confirma, mirando la foto, que ese evento de cámara es esta visita. */
  router.post("/visits/:id/confirm-camera-event", async (req, res) => {
    const { event_id } = parse(confirmEventSchema, req.body);
    res.json(toVisitWithMatchDto(await reconciliation.confirm(idOf(req.params.id), event_id)));
  });

  return router;
}
