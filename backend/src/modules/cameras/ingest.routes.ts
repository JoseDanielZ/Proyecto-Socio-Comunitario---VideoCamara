import express, { Router } from "express";
import { ingestEventSchema, ingestStatusSchema } from "@conjunto/contracts";
import { AppError, invalid, unauthorized } from "../../shared/errors";
import { parse, safeEqual } from "../../shared/http";
import type { NewVehicleEvent, VehicleEvent } from "../vehicle-events/events.service";
import type { CamerasService } from "./cameras.service";

/** Lo único que la ingesta necesita de los eventos: poder guardar uno nuevo. */
export interface EventRecorder {
  record(event: NewVehicleEvent): Promise<VehicleEvent>;
}

const JPEG_MAGIC = Buffer.from([0xff, 0xd8]);
const MAX_FRAME_BYTES = 2 * 1024 * 1024;

/**
 * Rutas internas para el motor de visión (Python). No usan sesiones de usuario: se autentican con
 * una clave compartida (X-Ingest-Key). Sin clave configurada, quedan deshabilitadas.
 */
export function ingestRoutes(recorder: EventRecorder, cameras: CamerasService, apiKey: string | null): Router {
  const router = Router();

  router.use("/internal", (req, _res, next) => {
    if (!apiKey) throw new AppError(503, "La ingesta de cámara está deshabilitada: falta INGEST_API_KEY");
    const given = req.header("x-ingest-key");
    if (!given || !safeEqual(given, apiKey)) throw unauthorized("Clave de ingesta inválida");
    next();
  });

  router.post("/internal/vehicle-events", async (req, res) => {
    const e = parse(ingestEventSchema, req.body);
    const saved = await recorder.record({
      cameraId: e.camera_id,
      occurredAt: e.occurred_at,
      vehicleType: e.vehicle_type,
      color: e.color ?? null,
      plateText: e.plate_text ?? null,
      plateConfidence: e.plate_confidence ?? null,
      direction: e.direction ?? null,
      trackerId: e.tracker_id ?? null,
      snapshotFile: e.snapshot_file ?? null,
    });
    res.status(201).json({ id: saved.id });
  });

  router.post("/internal/cameras/:id/status", (req, res) => {
    cameras.report(String(req.params.id), parse(ingestStatusSchema, req.body));
    res.status(204).end();
  });

  router.put(
    "/internal/cameras/:id/frame",
    express.raw({ type: "image/jpeg", limit: MAX_FRAME_BYTES }),
    (req, res) => {
      const jpeg: unknown = req.body;
      if (!Buffer.isBuffer(jpeg) || jpeg.length < 4 || !jpeg.subarray(0, 2).equals(JPEG_MAGIC)) {
        throw invalid("El fotograma debe ser un JPEG (Content-Type: image/jpeg)");
      }
      cameras.publishFrame(String(req.params.id), jpeg);
      res.status(204).end();
    },
  );

  return router;
}
