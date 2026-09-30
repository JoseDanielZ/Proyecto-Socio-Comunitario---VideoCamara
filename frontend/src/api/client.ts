import type { Session } from "./types";

const TOKEN_KEY = "conjunto.session";

/** La sesión vive en sessionStorage: se cierra al cerrar la pestaña. Todo acceso va en try/catch
 * porque el navegador puede bloquearlo (modo privado, políticas de datos). */
export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  try {
    if (session) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* sin almacenamiento: la sesión dura lo que dure la página */
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

/** Texto que ve la persona cuando algo falla: dice qué pasó, sin códigos técnicos. */
function messageFor(status: number, detail: unknown): string {
  // Los fallos del servidor (5xx) nunca muestran su texto interno: no le sirve a la persona.
  if (status >= 500) return "El servidor tuvo un problema. Inténtalo otra vez en un momento.";
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail) && detail.length) {
    // errores de validación de FastAPI: [{ loc: [...], msg: "..." }]
    const first = detail[0] as { loc?: unknown[]; msg?: string };
    const field = first.loc?.[first.loc.length - 1];
    return `Revisa el campo "${String(field)}": ${first.msg ?? "valor no válido"}`;
  }
  if (status === 0) return "No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.";
  return "No se pudo completar la acción.";
}

type Query = Record<string, string | number | boolean | null | undefined>;

export function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

export async function request<T>(
  method: string,
  path: string,
  options: { body?: unknown; query?: Query } = {},
): Promise<T> {
  const session = loadSession();
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (session) headers.Authorization = `Bearer ${session.access_token}`;

  let response: Response;
  try {
    response = await fetch(withQuery(`/api${path}`, options.query), {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, messageFor(0, null));
  }

  if (response.status === 401 && session) onUnauthorized(); // sesión vencida: volver al login
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(response.status, messageFor(response.status, data?.detail));
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

/** URL de una imagen/video protegido: <img> no puede enviar cabeceras, así que va el token en la URL. */
export function mediaUrl(path: string, cacheBust?: number): string {
  const session = loadSession();
  const query: Query = { access_token: session?.access_token, t: cacheBust };
  return withQuery(path.startsWith("/api") ? path : `/api${path}`, query);
}
