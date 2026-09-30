import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { mediaUrl } from "../api/client";
import type { Camera, MatchStatus, TicketPriority, TicketStatus, VehicleEvent } from "../api/types";
import { formatPlate, timeAgo } from "../format";
import { matchLabel, priorityLabel, statusLabel, vehicleLabel } from "../labels";
import { Icon, type IconName } from "./Icon";

export type Tone = "ok" | "warn" | "bad" | "info" | "quiet";

/** Etiqueta corta. El color nunca va solo: siempre lleva texto (y, si aporta, un icono). */
export function Chip({ tone = "quiet", icon, children }: { tone?: Tone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`chip chip--${tone}`}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

const MATCH_TONE: Record<MatchStatus, { tone: Tone; icon: IconName }> = {
  verified: { tone: "ok", icon: "check" },
  possible: { tone: "warn", icon: "question" },
  no_camera_evidence: { tone: "bad", icon: "alert" },
  not_applicable: { tone: "quiet", icon: "slash" },
};

export function MatchChip({ status }: { status: MatchStatus }) {
  const { tone, icon } = MATCH_TONE[status];
  return (
    <Chip tone={tone} icon={icon}>
      {matchLabel[status]}
    </Chip>
  );
}

const STATUS_TONE: Record<TicketStatus, Tone> = { open: "info", in_progress: "warn", resolved: "ok", closed: "quiet" };
export function StatusChip({ status }: { status: TicketStatus }) {
  return <Chip tone={STATUS_TONE[status]}>{statusLabel[status]}</Chip>;
}

const PRIORITY_TONE: Record<TicketPriority, Tone> = { low: "quiet", medium: "info", high: "warn", urgent: "bad" };
export function PriorityChip({ priority }: { priority: TicketPriority }) {
  return <Chip tone={PRIORITY_TONE[priority]}>{priorityLabel[priority]}</Chip>;
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {children && <div className="page-header__actions">{children}</div>}
    </header>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {hint && <p className="empty__hint">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : "Algo salió mal.";
  return (
    <div className="note note--bad" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn btn--small" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Loading({ label = "Cargando…" }: { label?: string }) {
  return (
    <p className="loading" role="status">
      {label}
    </p>
  );
}

/** Foto del recorte que la cámara guardó del vehículo (o un cuadro vacío si no hay). */
export function EventPhoto({ event, size = "sm" }: { event: VehicleEvent; size?: "sm" | "lg" }) {
  if (!event.snapshot_url) {
    return <span className={`photo photo--${size} photo--none`} aria-hidden="true" />;
  }
  return (
    <img
      className={`photo photo--${size}`}
      src={mediaUrl(event.snapshot_url)}
      alt={`${vehicleLabel[event.vehicle_type]} ${event.color ?? ""}`.trim()}
      loading="lazy"
    />
  );
}

/** Descripción corta de un cruce: "Moto negra · PBA-123C". */
export function describeEvent(event: VehicleEvent): string {
  const parts = [vehicleLabel[event.vehicle_type], event.color].filter(Boolean).join(" ");
  return event.plate_text ? `${parts} · ${formatPlate(event.plate_text)}` : `${parts} · placa no leída`;
}

export function EventRow({ event, action }: { event: VehicleEvent; action?: ReactNode }) {
  return (
    <li className="row row--photo">
      <EventPhoto event={event} />
      <div className="row__main">
        <p className="row__title">{describeEvent(event)}</p>
        <p className="row__meta">{timeAgo(event.occurred_at)}</p>
      </div>
      {action}
    </li>
  );
}

export function LinkRow({ to, children }: { to: string; children: ReactNode }) {
  return (
    <li>
      <Link className="row row--link" to={to}>
        {children}
        <Icon name="chevron" size={18} />
      </Link>
    </li>
  );
}

/** Video en vivo anotado (MJPEG). El navegador lo muestra con un <img>. */
export function LiveVideo({ camera }: { camera: Camera | undefined }) {
  if (!camera) return <div className="video video--empty">Sin cámaras configuradas</div>;
  const live = camera.status === "running" || camera.status === "starting";
  const idle: Record<Camera["status"], string> = {
    running: "",
    starting: "",
    finished: "El video de prueba terminó",
    stopped: "La cámara está detenida",
    error: "La cámara falló",
    disabled: "La cámara está desactivada",
  };
  return (
    <figure className="video">
      <img
        // Al reanudarse una cámara cambia la clave y el navegador abre un stream nuevo.
        key={camera.status}
        className="video__img"
        src={mediaUrl(`/cameras/${camera.id}/stream`)}
        alt={`Video de ${camera.name} con vehículos marcados`}
      />
      <figcaption className="video__caption">
        <span className={`live ${live ? "live--on" : ""}`}>{live ? "En vivo" : idle[camera.status]}</span>
        <span>{camera.crossings} vehículos contados</span>
      </figcaption>
      {camera.status === "error" && camera.detail && <p className="video__error">{camera.detail}</p>}
    </figure>
  );
}
