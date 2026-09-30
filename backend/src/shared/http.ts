import type { ErrorRequestHandler, Request, RequestHandler } from "express";
import { timingSafeEqual, createHash } from "node:crypto";
import { z, ZodError } from "zod";
import type { Role } from "@conjunto/contracts";
import { AppError, forbidden, unauthorized } from "./errors";

// Mensajes de validación en español ("Too small: ..." -> "Demasiado corto: ...").
z.config(z.locales.es());

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Lo único que este archivo necesita del módulo de autenticación. */
export interface Authenticator {
  authenticate(token: string): Promise<AuthUser>;
}

/** Valida datos de entrada con un esquema del contrato; si no cumple, el manejador responde 422. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  return schema.parse(data);
}

/**
 * Exige sesión. El token va en `Authorization: Bearer` o, para <img>/<video> que no pueden enviar
 * cabeceras, en `?access_token=`.
 */
export function requireSession(auth: Authenticator): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    const fromHeader = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const fromQuery = typeof req.query.access_token === "string" ? req.query.access_token : undefined;
    const token = fromHeader ?? fromQuery;
    if (!token) throw unauthorized();
    req.user = await auth.authenticate(token);
    next();
  };
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

/** Usuario de la petición en rutas que ya pasaron por `requireSession`. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

/** Compara secretos sin filtrar información por el tiempo de respuesta. */
export function safeEqual(a: string, b: string): boolean {
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    // Mismo formato que ya entiende el frontend: [{ loc: [...campo], msg }]
    res.status(422).json({ detail: err.issues.map((i) => ({ loc: i.path, msg: i.message })) });
    return;
  }
  if (err instanceof AppError) {
    if (err.status === 401) res.setHeader("WWW-Authenticate", "Bearer");
    res.status(err.status).json({ detail: err.message });
    return;
  }
  const status = (err as { status?: number }).status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    // errores de body-parser: JSON mal formado, cuerpo demasiado grande...
    res.status(status).json({ detail: status === 413 ? "El contenido es demasiado grande" : "Petición no válida" });
    return;
  }
  console.error(err);
  res.status(500).json({ detail: "Error interno del servidor" });
};
