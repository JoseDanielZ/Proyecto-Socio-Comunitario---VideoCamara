import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";
import { saveSession } from "./api/client";
import { AuthProvider } from "./auth/AuthContext";

function mountAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const user = (role: "admin" | "guard") => ({ id: 1, username: role, full_name: `Usuario ${role}`, role, is_active: true });

function stubApi(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = url.replace("/api", "").split("?")[0]!;
      if (path in routes) return { ok: true, status: 200, json: async () => routes[path] };
      return { ok: false, status: 404, json: async () => ({ detail: "no existe" }) };
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  saveSession(null);
});

describe("acceso", () => {
  it("sin sesión, cualquier página lleva al login", () => {
    mountAt("/tickets");
    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
  });

  it("un login correcto entra al inicio con el nombre de la persona", async () => {
    stubApi({
      "/auth/login": { access_token: "t", user: user("guard") },
      "/dashboard": {
        vehicles_today: 4, vehicles_today_by_type: { car: 4 }, active_visits: 1,
        tickets_by_status: { open: 2, in_progress: 0, resolved: 0, closed: 0 },
        unregistered_motorcycles: [], camera: null,
      },
    });
    mountAt("/login");
    await userEvent.type(screen.getByLabelText("Usuario"), "guardia1");
    await userEvent.type(screen.getByLabelText("Contraseña"), "guardia123");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("link", { name: /Registrar ingreso/ })).toBeInTheDocument();
    expect(await screen.findByText("Todo en orden")).toBeInTheDocument();
  });

  it("un login incorrecto muestra el motivo y no entra", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ detail: "Usuario o contraseña incorrectos" }) })));
    mountAt("/login");
    await userEvent.type(screen.getByLabelText("Usuario"), "x");
    await userEvent.type(screen.getByLabelText("Contraseña"), "mala");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Usuario o contraseña incorrectos");
    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
  });
});

describe("permisos por rol", () => {
  it("un guardia no ve la página de usuarios", async () => {
    saveSession({ access_token: "t", user: user("guard") });
    stubApi({});
    mountAt("/usuarios");
    expect(await screen.findByText("No tienes acceso a esta sección")).toBeInTheDocument();
  });

  it("la administración sí ve la lista de usuarios", async () => {
    saveSession({ access_token: "t", user: user("admin") });
    stubApi({ "/users": [user("admin")] });
    mountAt("/usuarios");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Usuarios" })).toBeInTheDocument());
    expect(await screen.findByText(/admin · Administración/)).toBeInTheDocument();
  });

  it("una ruta que no existe lo dice y ofrece volver", async () => {
    saveSession({ access_token: "t", user: user("guard") });
    stubApi({});
    mountAt("/nada");
    expect(await screen.findByText("Esta página no existe")).toBeInTheDocument();
  });
});
