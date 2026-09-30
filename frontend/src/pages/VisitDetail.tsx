import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "../api/endpoints";
import type { VisitWithMatch } from "../api/types";
import { Verdict } from "../components/Verdict";
import { ErrorNote, Loading, PageHeader } from "../components/ui";
import { duration, formatPlate, formatWhen } from "../format";
import { vehicleLabel, visitTypeLabel } from "../labels";

export function VisitDetail() {
  const id = Number(useParams().id);
  const location = useLocation();
  const queryClient = useQueryClient();
  const key = ["visit", id];
  const fromRegistration = (location.state as { result?: VisitWithMatch } | null)?.result;

  // Al abrir se vuelve a comparar con las cámaras: el vehículo pudo procesarse después del registro.
  const { data, error, isPending, refetch } = useQuery({
    queryKey: key,
    queryFn: () => api.recheckVisit(id),
    initialData: fromRegistration,
  });

  const store = (result: VisitWithMatch) => {
    queryClient.setQueryData(key, result);
    void queryClient.invalidateQueries({ queryKey: ["visits"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const recheck = useMutation({ mutationFn: () => api.recheckVisit(id), onSuccess: store });
  const confirm = useMutation({
    mutationFn: (eventId: number) => api.confirmVisitEvent(id, eventId),
    onSuccess: store,
  });
  const exit = useMutation({
    mutationFn: () => api.exitVisit(id),
    onSuccess: (visit) => store({ visit, camera_match: data!.camera_match }),
  });

  if (isPending) return <Loading />;
  if (error || !data) return <ErrorNote error={error} onRetry={() => void refetch()} />;

  const { visit, camera_match: match } = data;
  const busy = recheck.isPending || confirm.isPending || exit.isPending;
  const rows: [string, string | null][] = [
    ["Tipo", [visitTypeLabel[visit.visit_type], visit.company].filter(Boolean).join(" · ")],
    ["Vehículo", visit.vehicle_type ? [vehicleLabel[visit.vehicle_type], visit.plate ? formatPlate(visit.plate) : "sin placa"].join(" · ") : "A pie"],
    ["Visita a", visit.destination],
    ["Cédula", visit.document_id],
    ["Entró", formatWhen(visit.entered_at)],
    ["Salió", visit.exited_at ? `${formatWhen(visit.exited_at)} (estuvo ${duration(visit.entered_at, visit.exited_at)})` : `Sigue dentro · lleva ${duration(visit.entered_at)}`],
    ["Notas", visit.notes],
  ];

  return (
    <div className="stack">
      <PageHeader title={visit.full_name}>
        <Link to="/visitas" className="btn btn--small">
          Volver
        </Link>
      </PageHeader>

      <Verdict
        visit={visit}
        match={match}
        busy={busy}
        onRecheck={() => recheck.mutate()}
        onConfirm={match.event ? () => confirm.mutate(match.event!.id) : undefined}
      />
      <ErrorNote error={recheck.error ?? confirm.error ?? exit.error} />

      <dl className="facts">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>

      {visit.is_active && (
        <button className="btn btn--primary btn--block btn--tall" disabled={busy} onClick={() => exit.mutate()}>
          Registrar salida
        </button>
      )}
    </div>
  );
}
