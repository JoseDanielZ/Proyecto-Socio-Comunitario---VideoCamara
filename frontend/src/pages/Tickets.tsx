import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/endpoints";
import type { TicketStatus } from "../api/types";
import { Icon } from "../components/Icon";
import { Empty, ErrorNote, LinkRow, Loading, PageHeader, PriorityChip, StatusChip } from "../components/ui";
import { timeAgo } from "../format";
import { categoryLabel, statusLabel } from "../labels";

const FILTERS: (TicketStatus | "")[] = ["", "open", "in_progress", "resolved", "closed"];

export function Tickets() {
  const [status, setStatus] = useState<TicketStatus | "">("");
  const [search, setSearch] = useState("");

  const stats = useQuery({ queryKey: ["tickets", "stats"], queryFn: api.ticketStats, refetchInterval: 15_000 });
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["tickets", status, search],
    queryFn: () => api.tickets({ status, q: search.trim() || undefined, limit: 100 }),
    refetchInterval: 15_000,
  });

  const count = (s: TicketStatus | "") =>
    s ? stats.data?.by_status[s] : stats.data ? Object.values(stats.data.by_status).reduce((a, b) => a + b, 0) : undefined;

  return (
    <div className="stack">
      <PageHeader title="Tickets">
        <Link to="/tickets/nuevo" className="btn btn--primary">
          <Icon name="plus" size={18} />
          Nuevo ticket
        </Link>
      </PageHeader>

      <div className="pills" role="group" aria-label="Filtrar por estado">
        {FILTERS.map((f) => (
          <button key={f || "all"} className={status === f ? "is-on" : ""} aria-pressed={status === f} onClick={() => setStatus(f)}>
            {f ? statusLabel[f] : "Todos"}
            {count(f) !== undefined && <span className="pills__count">{count(f)}</span>}
          </button>
        ))}
      </div>

      <label className="field field--search">
        <span className="sr-only">Buscar</span>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código, título o lugar" />
      </label>

      {isPending && <Loading />}
      <ErrorNote error={error} onRetry={() => void refetch()} />
      {data && data.items.length === 0 && (
        <Empty
          title={search || status ? "No hay tickets con esos filtros" : "Todavía no hay tickets"}
          hint={!search && !status ? "Crea uno cuando un residente reporte un daño o una solicitud." : undefined}
          action={
            !search && !status ? (
              <Link to="/tickets/nuevo" className="btn btn--primary">
                Crear el primero
              </Link>
            ) : undefined
          }
        />
      )}
      {data && data.items.length > 0 && (
        <ul className="list">
          {data.items.map((t) => (
            <LinkRow key={t.id} to={`/tickets/${t.id}`}>
              <div className="row__main">
                <p className="row__title">
                  <span className="code">{t.code}</span> {t.title}
                </p>
                <p className="row__meta">
                  {[categoryLabel[t.category], t.location, `actualizado ${timeAgo(t.updated_at)}`].filter(Boolean).join(" · ")}
                </p>
                <p className="row__chips">
                  <StatusChip status={t.status} />
                  <PriorityChip priority={t.priority} />
                </p>
              </div>
            </LinkRow>
          ))}
        </ul>
      )}
    </div>
  );
}
