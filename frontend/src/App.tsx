import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Shell } from "./components/Shell";
import { Empty } from "./components/ui";
import { Accesses } from "./pages/Accesses";
import { CameraPage } from "./pages/CameraPage";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { TicketDetail } from "./pages/TicketDetail";
import { TicketNew } from "./pages/TicketNew";
import { Tickets } from "./pages/Tickets";
import { Users } from "./pages/Users";
import { VisitDetail } from "./pages/VisitDetail";
import { VisitNew } from "./pages/VisitNew";
import { Visits } from "./pages/Visits";
import type { Role } from "./api/types";
import type { ReactNode } from "react";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user } = useAuth();
  return user?.role === role ? (
    <>{children}</>
  ) : (
    <Empty title="No tienes acceso a esta sección" hint="Pídele a la administración que te dé el permiso." action={<Link to="/" className="btn">Ir al inicio</Link>} />
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route path="visitas" element={<Visits />} />
        <Route path="visitas/nueva" element={<VisitNew />} />
        <Route path="visitas/:id" element={<VisitDetail />} />
        <Route path="camara" element={<CameraPage />} />
        <Route path="accesos" element={<Accesses />} />
        <Route path="tickets" element={<Tickets />} />
        <Route path="tickets/nuevo" element={<TicketNew />} />
        <Route path="tickets/:id" element={<TicketDetail />} />
        <Route
          path="usuarios"
          element={
            <RequireRole role="admin">
              <Users />
            </RequireRole>
          }
        />
        <Route
          path="*"
          element={<Empty title="Esta página no existe" action={<Link to="/" className="btn">Ir al inicio</Link>} />}
        />
      </Route>
    </Routes>
  );
}
