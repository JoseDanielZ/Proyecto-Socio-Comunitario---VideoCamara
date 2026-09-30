import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/endpoints";
import type { VehicleType } from "../api/types";
import { Chip, Empty, ErrorNote, EventPhoto, Loading, PageHeader, describeEvent } from "../components/ui";
import { formatWhen } from "../format";
import { vehicleLabel } from "../labels";

const PAGE = 30;
const TYPES: (VehicleType | "")[] = ["", "car", "motorcycle", "truck", "bus"];

export function Accesses() {
  const [type, setType] = useState<VehicleType | "">("");
  const [plate, setPlate] = useState("");

  const summary = useQuery({ queryKey: ["vehicle-events", "summary"], queryFn: () => api.vehicleEventsSummary({}) });
  const list = useInfiniteQuery({
    queryKey: ["vehicle-events", type, plate],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.vehicleEvents({ type, plate: plate || undefined, limit: PAGE, offset: pageParam }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="stack">
      <PageHeader title="Accesos vehiculares" />

      {summary.data && (
        <p className="summary">
          <strong>{summary.data.total}</strong> vehículos en las últimas 24 horas
          {Object.entries(summary.data.by_type).map(([t, n]) => (
            <Chip key={t}>{`${n} ${vehicleLabel[t as VehicleType]?.toLowerCase() ?? t}`}</Chip>
          ))}
        </p>
      )}

      <div className="filters">
        <label className="field">
          <span>Tipo</span>
          <select value={type} onChange={(e) => setType(e.target.value as VehicleType | "")}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t ? vehicleLabel[t] : "Todos"}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Placa</span>
          <input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="PBA1234" autoComplete="off" />
        </label>
      </div>

      {list.isPending && <Loading />}
      <ErrorNote error={list.error} onRetry={() => void list.refetch()} />
      {!list.isPending && items.length === 0 && (
        <Empty title="No hay vehículos con esos filtros" hint="Prueba quitando el tipo o la placa." />
      )}
      <ul className="list">
        {items.map((event) => (
          <li key={event.id} className="row row--photo">
            <EventPhoto event={event} />
            <div className="row__main">
              <p className="row__title">{describeEvent(event)}</p>
              <p className="row__meta">{formatWhen(event.occurred_at)}</p>
            </div>
          </li>
        ))}
      </ul>
      {list.hasNextPage && (
        <button className="btn btn--block" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
          {list.isFetchingNextPage ? "Cargando…" : "Ver más"}
        </button>
      )}
    </div>
  );
}
