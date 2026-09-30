import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { initials } from "../format";
import { roleLabel } from "../labels";
import { Icon, type IconName } from "./Icon";
import { Logo } from "./Logo";

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: "/", label: "Inicio", icon: "home", end: true },
  { to: "/visitas", label: "Visitas", icon: "visits" },
  { to: "/camara", label: "Cámara", icon: "camera" },
  { to: "/tickets", label: "Tickets", icon: "ticket" },
  { to: "/accesos", label: "Accesos", icon: "access" },
];

function AccountMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <details className="account">
      <summary className="account__button" aria-label={`Cuenta de ${user.full_name}`}>
        <span className="account__avatar">{initials(user.full_name)}</span>
        <span className="account__name">{user.full_name}</span>
      </summary>
      <div className="account__menu">
        <p className="account__who">
          {user.full_name}
          <span>{roleLabel[user.role]}</span>
        </p>
        {user.role === "admin" && (
          <NavLink to="/usuarios" className="account__item">
            <Icon name="users" size={18} />
            Usuarios
          </NavLink>
        )}
        <button type="button" className="account__item" onClick={logout}>
          <Icon name="logout" size={18} />
          Cerrar sesión
        </button>
      </div>
    </details>
  );
}

export function Shell() {
  return (
    <div className="shell">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <aside className="rail">
        <Logo size={44} />
        <nav aria-label="Secciones">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="rail__link">
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="shell__body">
        <header className="topbar">
          <span className="topbar__logo">
            <Logo size={34} />
          </span>
          <AccountMenu />
        </header>
        <main id="contenido" className="content">
          <Outlet />
        </main>
      </div>

      <nav className="tabs" aria-label="Secciones">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="tabs__link">
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
