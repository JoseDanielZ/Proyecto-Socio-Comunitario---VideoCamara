import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/endpoints";
import type { Visit } from "../api/types";
import { Icon } from "../components/Icon";
import { Empty, ErrorNote, LinkRow, Loading, MatchChip, PageHeader } from "../components/ui";
import { duration, formatPlate, formatWhen } from "../format";
import { vehicleLabel, visitTypeLabel } from "../labels";

function VisitLine({ visit }: { visit: Visit }) {
  const vehicle = [visit.vehicle_type ? vehicleLabel[visit.vehicle_type] : null, visit.plate ? formatPlate(visit.plate) : null]
    .filter(Boolean)
    .join(" ");
  const who = [visitTypeLabel[visit.visit_type], visit.company].filter(Boolean).join(" · ");
  return (
    <LinkRow to={`/visitas/${visit.id}`}>
      <div className="row__main">
        <p className="row__title">{visit.full_name}</p>
        <p className="row__meta">
          {who}
          {vehicle && ` · ${vehicle}`}
          {visit.destination && ` → ${visit.destination}`}
        </p>
        <p className="row__meta">
          {visit.is_active
            ? `Entró ${formatWhen(visit.entered_at)} · lleva ${duration(visit.entered_at)}`
            : `${formatWhen(visit.entered_at)} · estuvo ${duration(visit.entered_at, visit.exited_at)}`}
        </p>
      </div>
      {visit.match_status !== "not_applicable" && <MatchChip status={visit.match_status} />}
    </LinkRow>
  );
}

export function Visits() {
  const [active, setActive] = useState(true);
  const [search, setSearch] = useState("");
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["visits", active, search],
    queryFn: () => api.visits({ active, q: search.trim() || undefined, limit: 100 }),
    refetchInterval: 15_000,
  });

  return (
    <div className="stack">
      <PageHeader title="Visitas y deliveries">
        <Link to="/visitas/nueva" className="btn btn--primary">
          <Icon name="plus" size={18} />
          Registrar ingreso
        </Link>
      </PageHeader>

      <div className="segmented" role="tablist" aria-label="Estado de las visitas">
        <button role="tab" aria-selected={active} className={active ? "is-on" : ""} onClick={() => setActive(true)}>
          Dentro ahora
        </button>
        <button role="tab" aria-selected={!active} className={!active ? "is-on" : ""} onClick={() => setActive(false)}>
          Ya salieron
        </button>
      </div>

      <label className="field field--search">
        <span className="sr-only">Buscar</span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, placa, empresa o casa"
        />
      </label>

      {isPending && <Loading />}
      <ErrorNote error={error} onRetry={() => void refetch()} />
      {data && data.items.length === 0 && (
        <Empty
          title={search ? "Nadie coincide con esa búsqueda" : active ? "No hay nadie registrado dentro" : "Todavía no hay salidas registradas"}
          hint={active && !search ? "Cuando registres un ingreso aparecerá aquí." : undefined}
        />
      )}
      {data && data.items.length > 0 && (
        <ul className="list">
          {data.items.map((visit) => (
            <VisitLine key={visit.id} visit={visit} />
          ))}
        </ul>
      )}
    </div>
  );
}
