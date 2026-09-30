/** Reglas del ticket: qué cambios se permiten y cómo queda su historial. Funciones puras, sin I/O. */
import type { TicketCategory, TicketEntryKind, TicketPriority, TicketStatus } from "@conjunto/contracts";
import { conflict, invalid } from "../../shared/errors";

export interface TicketEntry {
  id?: number;
  kind: TicketEntryKind;
  authorId: number;
  createdAt: Date;
  body: string | null;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus | null;
}

export interface Ticket {
  id: number;
  code: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  location: string | null;
  reporterName: string | null;
  reporterContact: string | null;
  createdBy: number;
  assignedTo: number | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  entries: TicketEntry[];
}

/** Estados a los que puede pasar cada estado. Agregar un estado nuevo es agregar una fila. */
export const ALLOWED_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  open: ["in_progress", "closed"],
  in_progress: ["open", "resolved", "closed"],
  resolved: ["in_progress", "closed"],
  closed: [],
};

const entry = (
  kind: TicketEntryKind,
  authorId: number,
  at: Date,
  extra: Partial<Pick<TicketEntry, "body" | "fromStatus" | "toStatus">> = {},
): TicketEntry => ({ kind, authorId, createdAt: at, body: null, fromStatus: null, toStatus: null, ...extra });

/** Entrada inicial del historial de un ticket recién creado. */
export const creationEntry = (authorId: number, at: Date, description: string) =>
  entry("created", authorId, at, { body: description });

export function withStatus(ticket: Ticket, next: TicketStatus, authorId: number, at: Date): Ticket {
  if (next === ticket.status) throw conflict(`El ticket ya está en estado '${ticket.status}'`);
  if (!ALLOWED_TRANSITIONS[ticket.status].includes(next)) {
    throw conflict(`No se puede pasar de '${ticket.status}' a '${next}'`);
  }
  return {
    ...ticket,
    status: next,
    resolvedAt: next === "resolved" ? at : null,
    updatedAt: at,
    entries: [...ticket.entries, entry("status_change", authorId, at, { fromStatus: ticket.status, toStatus: next })],
  };
}

export function withAssignee(ticket: Ticket, assigneeId: number | null, authorId: number, at: Date): Ticket {
  if (ticket.status === "closed") throw conflict("No se puede asignar un ticket cerrado");
  return {
    ...ticket,
    assignedTo: assigneeId,
    updatedAt: at,
    entries: [...ticket.entries, entry("assignment", authorId, at, { body: assigneeId ? String(assigneeId) : null })],
  };
}

export function withComment(ticket: Ticket, body: string, authorId: number, at: Date): Ticket {
  const text = body.trim();
  if (!text) throw invalid("El comentario no puede estar vacío");
  if (ticket.status === "closed") throw conflict("No se puede comentar un ticket cerrado");
  return { ...ticket, updatedAt: at, entries: [...ticket.entries, entry("comment", authorId, at, { body: text })] };
}
