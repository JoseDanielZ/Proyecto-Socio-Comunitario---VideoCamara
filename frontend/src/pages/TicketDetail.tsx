import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/endpoints";
import type { Ticket, TicketEntry, TicketStatus } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { ErrorNote, Loading, PageHeader, PriorityChip, StatusChip } from "../components/ui";
import { formatWhen } from "../format";
import { categoryLabel, nextStatuses, statusAction, statusLabel } from "../labels";

function entryText(entry: TicketEntry): string {
  switch (entry.kind) {
    case "created":
      return "Creó el ticket";
    case "comment":
      return entry.body ?? "";
    case "status_change":
      return `Cambió el estado: ${statusLabel[entry.from_status!]} → ${statusLabel[entry.to_status!]}`;
    case "assignment":
      return entry.body ? "Cambió la persona asignada" : "Quitó la asignación";
  }
}

export function TicketDetail() {
  const id = Number(useParams().id);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");

  const { data: ticket, error, isPending, refetch } = useQuery({ queryKey: ["ticket", id], queryFn: () => api.ticket(id), refetchInterval: 20_000 });
  const users = useQuery({ queryKey: ["users"], queryFn: api.users, enabled: isAdmin });

  const store = (next: Ticket) => {
    queryClient.setQueryData(["ticket", id], next);
    void queryClient.invalidateQueries({ queryKey: ["tickets"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const setStatus = useMutation({ mutationFn: (s: TicketStatus) => api.setTicketStatus(id, s), onSuccess: store });
  const assign = useMutation({ mutationFn: (userId: number | null) => api.assignTicket(id, userId), onSuccess: store });
  const addComment = useMutation({
    mutationFn: (body: string) => api.commentTicket(id, body),
    onSuccess: (next) => {
      setComment("");
      store(next);
    },
  });

  if (isPending) return <Loading />;
  if (error || !ticket) return <ErrorNote error={error} onRetry={() => void refetch()} />;

  const closed = ticket.status === "closed";
  const mutationError = setStatus.error ?? assign.error ?? addComment.error;
  const assignable = (users.data ?? []).filter((u) => u.is_active);

  function submitComment(event: FormEvent) {
    event.preventDefault();
    if (comment.trim()) addComment.mutate(comment);
  }

  return (
    <div className="stack">
      <PageHeader title={ticket.title}>
        <Link to="/tickets" className="btn btn--small">
          Volver
        </Link>
      </PageHeader>

      <p className="row__chips">
        <span className="code">{ticket.code}</span>
        <StatusChip status={ticket.status} />
        <PriorityChip priority={ticket.priority} />
      </p>

      {ticket.description && <p className="prose">{ticket.description}</p>}

      <dl className="facts">
        {(
          [
            ["Tipo", categoryLabel[ticket.category]],
            ["Lugar", ticket.location],
            ["Reportó", [ticket.reporter_name, ticket.reporter_contact].filter(Boolean).join(" · ")],
            ["Registrado por", `${ticket.created_by_name}, ${formatWhen(ticket.created_at)}`],
            ["Asignado a", ticket.assigned_to_name ?? "Sin asignar"],
            ["Resuelto", ticket.resolved_at ? formatWhen(ticket.resolved_at) : null],
          ] as [string, string | null][]
        )
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>

      {isAdmin && !closed && (
        <section className="panel" aria-label="Gestionar ticket">
          <div className="panel__actions">
            {nextStatuses[ticket.status].map((s) => (
              <button
                key={s}
                className={s === "resolved" || s === "in_progress" ? "btn btn--primary" : "btn"}
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate(s)}
              >
                {statusAction[s]}
              </button>
            ))}
          </div>
          <label className="field">
            <span>Asignado a</span>
            <select value={ticket.assigned_to ?? ""} disabled={assign.isPending} onChange={(e) => assign.mutate(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Sin asignar</option>
              {assignable.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}
      <ErrorNote error={mutationError} />

      <section aria-labelledby="historial">
        <h2 id="historial" className="section-title">
          Seguimiento
        </h2>
        <ol className="timeline">
          {ticket.entries.map((entry) => (
            <li key={entry.id} className={`timeline__item timeline__item--${entry.kind}`}>
              <p className="timeline__who">
                {entry.author_name} <span>{formatWhen(entry.created_at)}</span>
              </p>
              <p className="timeline__text">{entryText(entry)}</p>
            </li>
          ))}
        </ol>

        {closed ? (
          <p className="row__meta">El ticket está cerrado: ya no admite comentarios.</p>
        ) : (
          <form className="form" onSubmit={submitComment}>
            <label className="field">
              <span>Agregar un comentario</span>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
            </label>
            <button className="btn btn--block" disabled={addComment.isPending || !comment.trim()}>
              {addComment.isPending ? "Enviando…" : "Comentar"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
