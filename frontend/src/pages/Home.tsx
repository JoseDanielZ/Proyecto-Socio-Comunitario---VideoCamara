import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/endpoints";
import { mediaUrl } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Icon } from "../components/Icon";
import { Empty, ErrorNote, EventRow, Loading } from "../components/ui";
import { vehicleLabel } from "../labels";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function Home() {
  const { user } = useAuth();
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: api.dashboard,
    refetchInterval: 10_000,
  });

  const open = (data?.tickets_by_status.open ?? 0) + (data?.tickets_by_status.in_progress ?? 0);
  const byType = Object.entries(data?.vehicles_today_by_type ?? {})
    .map(([type, count]) => `${count} ${vehicleLabel[type as keyof typeof vehicleLabel]?.toLowerCase() ?? type}`)
    .join(", ");

  return (
    <div className="stack">
      <p className="greeting">
        {greeting()}, {user?.full_name}
      </p>

      <Link to="/visitas/nueva" className="btn btn--primary btn--hero">
        <Icon name="plus" />
        Registrar ingreso
      </Link>

      {isPending && <Loading />}
      <ErrorNote error={error} onRetry={() => void refetch()} />

      {data && (
        <>
          <section aria-labelledby="sin-registro">
            <h2 id="sin-registro" className="section-title">
              Motos que la cámara vio y nadie registró
            </h2>
            {data.unregistered_motorcycles.length === 0 ? (
              <Empty title="Todo en orden" hint="En las últimas 2 horas no hay motos sin registrar." />
            ) : (
              <ul className="list">
                {data.unregistered_motorcycles.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    action={
                      <Link
                        className="btn btn--small"
                        to={`/visitas/nueva?tipo=delivery&vehiculo=motorcycle${event.plate_text ? `&placa=${event.plate_text}` : ""}`}
                      >
                        Registrar
                      </Link>
                    }
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="numbers" aria-label="Resumen de hoy">
            <Link to="/accesos" className="numbers__item">
              <strong>{data.vehicles_today}</strong>
              <span>vehículos hoy</span>
              {byType && <small>{byType}</small>}
            </Link>
            <Link to="/visitas" className="numbers__item">
              <strong>{data.active_visits}</strong>
              <span>visitas dentro</span>
            </Link>
            <Link to="/tickets" className="numbers__item">
              <strong>{open}</strong>
              <span>tickets abiertos</span>
            </Link>
          </section>

          <section aria-labelledby="camara">
            <h2 id="camara" className="section-title">
              Cámara
            </h2>
            {data.camera ? (
              <Link to="/camara" className="preview">
                <img
                  src={mediaUrl(`/cameras/${data.camera.id}/snapshot.jpg`, Math.floor(Date.now() / 5000))}
                  alt={`Vista de ${data.camera.name}`}
                  onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                />
                <span className="preview__label">{data.camera.name} · ver en vivo</span>
              </Link>
            ) : (
              <Empty title="No hay cámaras configuradas" />
            )}
          </section>
        </>
      )}
    </div>
  );
}
