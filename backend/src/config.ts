import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const envSchema = z.object({
  PORT: z.coerce.number().int().default(8000),
  DATABASE_PATH: z.string().default("db/conjunto.sqlite"),
  /** Clave para firmar sesiones. En producción es obligatoria y de 32+ caracteres. */
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres").optional(),
  JWT_EXPIRES_MINUTES: z.coerce.number().int().default(720),
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://127.0.0.1:5173"),
  LOCAL_UTC_OFFSET_HOURS: z.coerce.number().int().default(-5),
  CAMERA_ID: z.string().default("entrada"),
  CAMERA_NAME: z.string().default("Entrada principal"),
  SNAPSHOTS_DIR: z.string().default("data/snapshots"),
  /** Clave compartida con el motor de visión (Python) para enviar eventos y fotogramas. */
  INGEST_API_KEY: z.string().min(16, "INGEST_API_KEY debe tener al menos 16 caracteres").optional(),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().default(10),
  NODE_ENV: z.string().default("development"),
});

export interface Config {
  port: number;
  databasePath: string;
  jwtSecret: string;
  jwtExpiresMinutes: number;
  corsOrigins: string[];
  localUtcOffsetHours: number;
  camera: { id: string; name: string };
  snapshotsDir: string;
  ingestApiKey: string | null;
  loginMaxAttempts: number;
  production: boolean;
}

const resolve = (p: string) => (path.isAbsolute(p) ? p : path.join(PROJECT_ROOT, p));

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuración inválida (${problems})`);
  }
  const e = parsed.data;
  const production = e.NODE_ENV === "production";
  if (production && !e.JWT_SECRET) throw new Error("JWT_SECRET es obligatorio en producción");
  return {
    port: e.PORT,
    databasePath: resolve(e.DATABASE_PATH),
    // En desarrollo, una clave temporal aleatoria: las sesiones se cierran al reiniciar.
    jwtSecret: e.JWT_SECRET ?? crypto.randomUUID() + crypto.randomUUID(),
    jwtExpiresMinutes: e.JWT_EXPIRES_MINUTES,
    corsOrigins: e.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
    localUtcOffsetHours: e.LOCAL_UTC_OFFSET_HOURS,
    camera: { id: e.CAMERA_ID, name: e.CAMERA_NAME },
    snapshotsDir: resolve(e.SNAPSHOTS_DIR),
    ingestApiKey: e.INGEST_API_KEY ?? null,
    loginMaxAttempts: e.LOGIN_MAX_ATTEMPTS,
    production,
  };
}
