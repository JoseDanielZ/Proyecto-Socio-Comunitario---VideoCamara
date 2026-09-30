import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/endpoints";
import type { TicketCategory, TicketPriority } from "../api/types";
import { ErrorNote, PageHeader } from "../components/ui";
import { categoryLabel, priorityLabel } from "../labels";

const CATEGORIES = Object.keys(categoryLabel) as TicketCategory[];
const PRIORITIES = Object.keys(priorityLabel) as TicketPriority[];

export function TicketNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TicketCategory>("maintenance");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [location, setLocation] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [reporterContact, setReporterContact] = useState("");

  const create = useMutation({
    mutationFn: api.createTicket,
    onSuccess: (ticket) => {
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      navigate(`/tickets/${ticket.id}`, { replace: true });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate({
      title,
      description,
      category,
      priority,
      location: location || null,
      reporter_name: reporterName || null,
      reporter_contact: reporterContact || null,
    });
  }

  return (
    <div className="stack">
      <PageHeader title="Nuevo ticket" />
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>¿Qué pasó?</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} autoComplete="off" required />
        </label>
        <label className="field">
          <span>Detalle</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
        </label>

        <fieldset className="choice">
          <legend>Tipo</legend>
          <div className="choice__options">
            {CATEGORIES.map((c) => (
              <label key={c} className={category === c ? "is-on" : ""}>
                <input type="radio" name="category" checked={category === c} onChange={() => setCategory(c)} />
                {categoryLabel[c]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="choice">
          <legend>Prioridad</legend>
          <div className="choice__options">
            {PRIORITIES.map((p) => (
              <label key={p} className={priority === p ? "is-on" : ""}>
                <input type="radio" name="priority" checked={priority === p} onChange={() => setPriority(p)} />
                {priorityLabel[p]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="field">
          <span>Lugar (casa, torre, área común)</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} autoComplete="off" />
        </label>
        <label className="field">
          <span>Quién lo reportó</span>
          <input value={reporterName} onChange={(e) => setReporterName(e.target.value)} autoComplete="off" />
        </label>
        <label className="field">
          <span>Teléfono o correo de contacto</span>
          <input value={reporterContact} onChange={(e) => setReporterContact(e.target.value)} autoComplete="off" />
        </label>

        <ErrorNote error={create.error} />
        <button className="btn btn--primary btn--block btn--tall" disabled={create.isPending || !title.trim()}>
          {create.isPending ? "Creando…" : "Crear ticket"}
        </button>
      </form>
    </div>
  );
}
