import { Router } from "express";
import { requireSession, type Authenticator } from "../../shared/http";
import type { CamerasService } from "./cameras.service";

const BOUNDARY = "frame";

export function camerasRoutes(cameras: CamerasService, auth: Authenticator): Router {
  const router = Router();
  router.use("/cameras", requireSession(auth));

  router.get("/cameras", (_req, res) => {
    res.json(cameras.list());
  });

  router.get("/cameras/:id/snapshot.jpg", (req, res) => {
    res.set({ "Content-Type": "image/jpeg", "Cache-Control": "no-store" }).send(cameras.snapshot(String(req.params.id)));
  });

  /** Video en vivo con cajas, tipo, color y conteo (MJPEG: se muestra con un <img>). */
  router.get("/cameras/:id/stream", (req, res) => {
    const id = String(req.params.id);
    cameras.get(id); // 404 si no existe, antes de abrir el stream
    res.writeHead(200, {
      "Content-Type": `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });

    let waitingForDrain = false;
    const stop = cameras.watch(id, (jpeg) => {
      // Cliente lento: se descartan fotogramas hasta que se ponga al día, sin acumular memoria.
      if (waitingForDrain || res.writableEnded) return;
      res.write(`--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`);
      res.write(jpeg);
      if (!res.write("\r\n")) {
        waitingForDrain = true;
        res.once("drain", () => (waitingForDrain = false));
      }
    });
    req.on("close", stop);
  });

  return router;
}
