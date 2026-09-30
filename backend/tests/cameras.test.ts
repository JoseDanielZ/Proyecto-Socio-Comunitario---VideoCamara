import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { buildServices } from "../src/compose";
import { openDatabase } from "../src/db";
import { CamerasService } from "../src/modules/cameras/cameras.service";
import { FrameHub } from "../src/modules/cameras/frame-hub";
import { AppError } from "../src/shared/errors";
import { FakeClock, testConfig } from "./support/helpers";

const frame = (n: number) => Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from(`cuadro-${n}`), Buffer.from([0xff, 0xd9])]);
const CAM = [{ id: "entrada", name: "Entrada principal" }];

describe("estado de la cámara", () => {
  it("antes de recibir señales dice que espera al motor de visión", () => {
    const cams = new CamerasService(CAM, new FrameHub());
    expect(cams.list()[0]).toMatchObject({ status: "stopped", detail: "Esperando al motor de visión", crossings: 0 });
  });

  it("refleja lo que reporta el motor de visión", () => {
    const cams = new CamerasService(CAM, new FrameHub());
    cams.report("entrada", { status: "finished", detail: "El video terminó", crossings: 25 });
    expect(cams.get("entrada")).toMatchObject({ status: "finished", detail: "El video terminó", crossings: 25 });
  });

  it("un fotograma cuenta como señal de vida y no pisa un estado final", () => {
    const cams = new CamerasService(CAM, new FrameHub());
    cams.publishFrame("entrada", frame(1));
    expect(cams.get("entrada").status).toBe("running");
    cams.report("entrada", { status: "error", detail: "se cayó", crossings: 2 });
    cams.publishFrame("entrada", frame(2));
    expect(cams.get("entrada")).toMatchObject({ status: "error", crossings: 2 });
  });

  it("si el motor de visión deja de dar señales, se marca detenida", () => {
    const clock = new FakeClock();
    const cams = new CamerasService(CAM, new FrameHub(), clock.read);
    cams.report("entrada", { status: "running", crossings: 1 });
    clock.advance(10_000);
    expect(cams.get("entrada").status).toBe("running");
    clock.advance(6_000);
    expect(cams.get("entrada")).toMatchObject({ status: "stopped", detail: "El motor de visión dejó de responder" });
  });

  it("una cámara terminada no se marca detenida por el paso del tiempo", () => {
    const clock = new FakeClock();
    const cams = new CamerasService(CAM, new FrameHub(), clock.read);
    cams.report("entrada", { status: "finished", crossings: 5 });
    clock.advance(60 * 60_000);
    expect(cams.get("entrada").status).toBe("finished");
  });

  it("cámaras desconocidas dan 404 y sin imagen todavía también", () => {
    const cams = new CamerasService(CAM, new FrameHub());
    expect(() => cams.snapshot("otra")).toThrow(AppError);
    expect(() => cams.report("otra", { status: "running", crossings: 0 })).toThrow(/no encontrada/);
    expect(() => cams.snapshot("entrada")).toThrow(/aún no produjo imagen/);
  });
});

describe("FrameHub", () => {
  it("entrega el último fotograma y avisa solo a quien sigue suscrito", () => {
    const hub = new FrameHub();
    const got: Buffer[] = [];
    const stop = hub.subscribe("c", (f) => got.push(f));
    hub.publish("c", frame(1));
    stop();
    hub.publish("c", frame(2));
    expect(got).toEqual([frame(1)]);
    expect(hub.latest("c")).toEqual(frame(2));
    expect(hub.viewers("c")).toBe(0);
  });
});

describe("video en vivo (MJPEG) por HTTP", () => {
  let server: http.Server | undefined;
  afterEach(() => new Promise<void>((done) => (server ? (server.closeAllConnections(), server.close(() => done())) : done())));

  it("entrega los fotogramas como multipart, empieza por el último y deja de enviar al desconectarse", async () => {
    const sql = openDatabase(":memory:");
    const hub = new FrameHub();
    const config = testConfig();
    const services = { ...buildServices(config, sql, { hashRounds: 4 }), cameras: new CamerasService(CAM, hub) };
    await services.auth.createUser({ username: "g", full_name: "G", role: "guard", password: "secret123" });
    const token = (await services.auth.login("g", "secret123")).accessToken;
    services.cameras.publishFrame("entrada", frame(1)); // ya hay un fotograma antes de conectarse

    server = createApp(config, services).listen(0);
    const { port } = server.address() as AddressInfo;

    const chunks: Buffer[] = [];
    const response = await new Promise<http.IncomingMessage>((resolve) => {
      const req = http.get({ port, path: `/api/cameras/entrada/stream?access_token=${token}` }, resolve);
      req.on("error", () => {});
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("multipart/x-mixed-replace; boundary=frame");
    response.on("data", (c: Buffer) => chunks.push(c));

    await new Promise((r) => setTimeout(r, 100));
    expect(hub.viewers("entrada")).toBe(1);
    services.cameras.publishFrame("entrada", frame(2));
    await new Promise((r) => setTimeout(r, 100));

    const body = Buffer.concat(chunks).toString("latin1");
    expect(body.match(/--frame/g)).toHaveLength(2);
    expect(body).toContain("Content-Type: image/jpeg");
    expect(body.indexOf("cuadro-1")).toBeLessThan(body.indexOf("cuadro-2"));

    response.destroy();
    await new Promise((r) => setTimeout(r, 100));
    expect(hub.viewers("entrada")).toBe(0); // no quedan suscripciones colgadas
    sql.close();
  });

  it("sin sesión no abre el stream", async () => {
    const sql = openDatabase(":memory:");
    const config = testConfig();
    server = createApp(config, buildServices(config, sql, { hashRounds: 4 })).listen(0);
    const { port } = server.address() as AddressInfo;
    const status = await new Promise<number>((resolve) =>
      http.get({ port, path: "/api/cameras/entrada/stream" }, (res) => (resolve(res.statusCode!), res.resume())),
    );
    expect(status).toBe(401);
    sql.close();
  });
});
