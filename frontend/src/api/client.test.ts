import { ApiError, loadSession, mediaUrl, request, saveSession, setUnauthorizedHandler, withQuery } from "./client";

const SESSION = { access_token: "tok123", user: { id: 1, username: "a", full_name: "A", role: "admin" as const, is_active: true } };

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  saveSession(null);
  setUnauthorizedHandler(() => {});
});

describe("withQuery", () => {
  it("omite valores vacíos y codifica el resto", () => {
    expect(withQuery("/x", { a: "1", b: "", c: undefined, d: null, e: "a b" })).toBe("/x?a=1&e=a+b");
    expect(withQuery("/x", {})).toBe("/x");
    expect(withQuery("/x")).toBe("/x");
  });
});

describe("sesión", () => {
  it("se guarda y se recupera", () => {
    saveSession(SESSION);
    expect(loadSession()?.access_token).toBe("tok123");
    saveSession(null);
    expect(loadSession()).toBeNull();
  });
});

describe("request", () => {
  it("envía el token y el cuerpo JSON", async () => {
    saveSession(SESSION);
    const fetchMock = mockFetch(200, { ok: true });
    await request("POST", "/tickets", { body: { title: "x" }, query: { q: "a" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/tickets?q=a");
    expect(init.headers.Authorization).toBe("Bearer tok123");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe('{"title":"x"}');
  });

  it("muestra el mensaje que manda el servidor", async () => {
    mockFetch(409, { detail: "No se puede pasar de 'open' a 'resolved'" });
    await expect(request("PATCH", "/x")).rejects.toMatchObject({ status: 409, message: "No se puede pasar de 'open' a 'resolved'" });
  });

  it("traduce errores de validación al campo afectado", async () => {
    mockFetch(422, { detail: [{ loc: ["body", "title"], msg: "Field required" }] });
    await expect(request("POST", "/x")).rejects.toThrow('Revisa el campo "title"');
  });

  it("explica la falta de conexión sin códigos técnicos", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const error = (await request("GET", "/x").catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toMatch(/No hay conexión/);
  });

  it("un error 500 no filtra detalles internos", async () => {
    mockFetch(500, { detail: "Traceback (most recent call last)..." });
    const error = (await request("GET", "/x").catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(500);
    expect(error.message).toBe("El servidor tuvo un problema. Inténtalo otra vez en un momento.");
    expect(error.message).not.toMatch(/Traceback/);
  });

  it("si la sesión vence (401) avisa para volver al login", async () => {
    saveSession(SESSION);
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    mockFetch(401, { detail: "Sesión inválida" });
    await expect(request("GET", "/x")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("un 401 del login no cierra ninguna sesión (no había)", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    mockFetch(401, { detail: "Usuario o contraseña incorrectos" });
    await expect(request("POST", "/auth/login", { body: {} })).rejects.toThrow("Usuario o contraseña incorrectos");
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

describe("mediaUrl", () => {
  it("agrega el token a las imágenes protegidas", () => {
    saveSession(SESSION);
    expect(mediaUrl("/api/vehicle-events/3/snapshot")).toBe("/api/vehicle-events/3/snapshot?access_token=tok123");
    expect(mediaUrl("/cameras/entrada/snapshot.jpg", 7)).toBe("/api/cameras/entrada/snapshot.jpg?access_token=tok123&t=7");
  });
});
