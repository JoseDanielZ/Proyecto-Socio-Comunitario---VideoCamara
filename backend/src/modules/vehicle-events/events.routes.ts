import path from "node:path";
import { Router } from "express";
import {
  summaryQuerySchema,
  vehicleEventQuerySchema,
  type VehicleEvent as VehicleEventDto,
} from "@conjunto/contracts";
import { invalid, notFound } from "../../shared/errors";
import { parse, requireSession, type Authenticator } from "../../shared/http";
import { HOUR_MS } from "../../shared/time";
import type { EventsService, VehicleEvent } from "./events.service";

export const toEventDto = (e: VehicleEvent): VehicleEventDto => ({
  id: e.id,
  camera_id: e.cameraId,
  occurred_at: e.occurredAt.toISOString(),
  vehicle_type: e.vehicleType,
  color: e.color,
  plate_text: e.plateText,
  plate_confidence: e.plateConfidence,
  direction: e.direction,
  snapshot_url: e.snapshotFile ? `/api/vehicle-events/${e.id}/snapshot` : null,
});

const SAFE_FILE = /^[\w.-]+\.jpg$/;

export function eventsRoutes(events: EventsService, auth: Authenticator, opts: { snapshotsDir: string }): Router {
  const router = Router();
  router.use("/vehicle-events", requireSession(auth));

  router.get("/vehicle-events", async (req, res) => {
    const q = parse(vehicleEventQuerySchema, req.query);
    const page = await events.list({
      start: q.from, end: q.to, plate: q.plate, vehicleType: q.type, color: q.color, limit: q.limit, offset: q.offset,
    });
    res.json({ items: page.items.map(toEventDto), total: page.total });
  });

  // Va antes de "/:id/snapshot": "summary" no es un id.
  router.get("/vehicle-events/summary", async (req, res) => {
    const q = parse(summaryQuerySchema, req.query);
    const end = q.to ?? new Date();
    const s = await events.summary(q.from ?? new Date(end.getTime() - 24 * HOUR_MS), end);
    res.json({ total: s.total, by_type: s.byType, by_color: s.byColor, by_hour: s.byHour });
  });

  router.get("/vehicle-events/:id/snapshot", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw invalid("Identificador inválido");
    const event = await events.get(id);
    if (!event.snapshotFile) throw notFound("Este evento no tiene foto");
    // Solo se sirven archivos que están DENTRO de la carpeta de fotos, aunque la base diga otra cosa.
    const root = path.resolve(opts.snapshotsDir);
    const file = path.resolve(root, event.snapshotFile);
    if (!SAFE_FILE.test(event.snapshotFile) || path.dirname(file) !== root) throw notFound("Foto no disponible");
    res.sendFile(file, { headers: { "Cache-Control": "private, max-age=3600" } }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ detail: "Foto no disponible" });
    });
  });

  return router;
}
