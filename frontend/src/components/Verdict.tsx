import type { CameraMatch, Visit } from "../api/types";
import { formatPlate, formatWhen } from "../format";
import { vehicleLabel } from "../labels";
import { Icon, type IconName } from "./Icon";
import { EventPhoto, describeEvent } from "./ui";

const VERDICT: Record<
  CameraMatch["status"],
  { tone: "ok" | "warn" | "bad" | "quiet"; icon: IconName; title: string }
> = {
  verified: { tone: "ok", icon: "check", title: "Respaldado por cámara" },
  possible: { tone: "warn", icon: "question", title: "Posible coincidencia" },
  no_camera_evidence: { tone: "bad", icon: "alert", title: "Sin respaldo de cámara" },
  not_applicable: { tone: "quiet", icon: "slash", title: "Ingreso sin vehículo" },
};

interface Props {
  visit: Visit;
  match: CameraMatch;
  busy?: boolean;
  onConfirm?: () => void;
  onRecheck?: () => void;
}

/** El momento clave del guardia: ¿lo que registré coincide con lo que vio la cámara? */
export function Verdict({ visit, match, busy, onConfirm, onRecheck }: Props) {
  const v = VERDICT[match.status];
  const declared = [visit.vehicle_type ? vehicleLabel[visit.vehicle_type] : null, visit.plate ? formatPlate(visit.plate) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className={`verdict verdict--${v.tone}`} aria-live="polite" aria-label="Resultado de la cámara">
      <div className="verdict__head">
        <span className="verdict__stamp">
          <Icon name={v.icon} size={28} />
        </span>
        <div>
          <h2 className="verdict__title">{v.title}</h2>
          <p className="verdict__reason">{match.reason}</p>
        </div>
      </div>

      {match.event && (
        <div className="verdict__evidence">
          <EventPhoto event={match.event} size="lg" />
          <dl className="facts facts--tight">
            <div>
              <dt>La cámara vio</dt>
              <dd>{describeEvent(match.event)}</dd>
            </div>
            <div>
              <dt>A las</dt>
              <dd>{formatWhen(match.event.occurred_at)}</dd>
            </div>
            {declared && (
              <div>
                <dt>Tú registraste</dt>
                <dd>{declared}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {(onConfirm || onRecheck) && match.status !== "not_applicable" && (
        <div className="verdict__actions">
          {match.status === "possible" && onConfirm && (
            <button type="button" className="btn btn--primary" disabled={busy} onClick={onConfirm}>
              Sí, es el mismo vehículo
            </button>
          )}
          {match.status !== "verified" && onRecheck && (
            <button type="button" className="btn" disabled={busy} onClick={onRecheck}>
              <Icon name="refresh" size={18} />
              Volver a comprobar
            </button>
          )}
        </div>
      )}
    </section>
  );
}
