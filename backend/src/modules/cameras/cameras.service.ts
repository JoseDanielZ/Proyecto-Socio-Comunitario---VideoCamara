import type { Camera, CameraStatus, IngestStatus } from "@conjunto/contracts";
import { notFound } from "../../shared/errors";
import { systemClock, type Clock } from "../../shared/time";
import type { FrameHub, FrameListener } from "./frame-hub";

export interface KnownCamera {
  id: string;
  name: string;
}

interface Report {
  status: CameraStatus;
  detail: string | null;
  crossings: number;
  at: number; // último aviso del motor de visión (ms)
}

/** Si el motor de visión no da señales en este tiempo, se considera detenido. */
const STALE_MS = 15_000;

/** Estado de las cámaras según lo que reporta el motor de visión, y acceso a su video. */
export class CamerasService {
  private readonly reports = new Map<string, Report>();

  constructor(
    private readonly cameras: readonly KnownCamera[],
    private readonly hub: Pick<FrameHub, "publish" | "latest" | "subscribe">,
    private readonly clock: Clock = systemClock,
  ) {}

  private known(id: string): KnownCamera {
    const camera = this.cameras.find((c) => c.id === id);
    if (!camera) throw notFound("Cámara no encontrada");
    return camera;
  }

  /** El motor de visión avisa cómo está (running, finished, error...) y cuántos vehículos contó. */
  report(cameraId: string, status: IngestStatus): void {
    this.known(cameraId);
    this.reports.set(cameraId, {
      status: status.status, detail: status.detail ?? null, crossings: status.crossings, at: this.clock().getTime(),
    });
  }

  /** Cada fotograma cuenta también como señal de vida. */
  publishFrame(cameraId: string, jpeg: Buffer): void {
    this.known(cameraId);
    const previous = this.reports.get(cameraId);
    this.reports.set(cameraId, {
      status: previous?.status === "finished" || previous?.status === "error" ? previous.status : "running",
      detail: previous?.detail ?? null,
      crossings: previous?.crossings ?? 0,
      at: this.clock().getTime(),
    });
    this.hub.publish(cameraId, jpeg);
  }

  list(): Camera[] {
    return this.cameras.map((camera) => {
      const r = this.reports.get(camera.id);
      if (!r) {
        return { ...camera, status: "stopped", detail: "Esperando al motor de visión", crossings: 0 };
      }
      const stale = (r.status === "running" || r.status === "starting") && this.clock().getTime() - r.at > STALE_MS;
      return {
        ...camera,
        status: stale ? "stopped" : r.status,
        detail: stale ? "El motor de visión dejó de responder" : r.detail,
        crossings: r.crossings,
      };
    });
  }

  get(cameraId: string): Camera {
    this.known(cameraId);
    return this.list().find((c) => c.id === cameraId)!;
  }

  snapshot(cameraId: string): Buffer {
    this.known(cameraId);
    const frame = this.hub.latest(cameraId);
    if (!frame) throw notFound("La cámara aún no produjo imagen");
    return frame;
  }

  /** Entrega el último fotograma de inmediato y luego cada uno nuevo. Devuelve cómo cancelar. */
  watch(cameraId: string, onFrame: FrameListener): () => void {
    this.known(cameraId);
    const current = this.hub.latest(cameraId);
    if (current) onFrame(current);
    return this.hub.subscribe(cameraId, onFrame);
  }
}
