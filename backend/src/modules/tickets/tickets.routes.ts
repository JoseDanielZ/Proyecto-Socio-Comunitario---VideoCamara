import { Router } from "express";
import {
  assignInSchema,
  commentInSchema,
  newTicketSchema,
  statusInSchema,
  ticketQuerySchema,
  type Ticket as TicketDto,
} from "@conjunto/contracts";
import { invalid } from "../../shared/errors";
import { currentUser, parse, requireRole, requireSession, type Authenticator } from "../../shared/http";
import type { Ticket } from "./tickets.rules";
import type { TicketsService } from "./tickets.service";

/** Para mostrar nombres en lugar de ids en el seguimiento. */
export interface NameDirectory {
  names(): Promise<Map<number, string>>;
}

export function toTicketDto(t: Ticket, names: Map<number, string>): TicketDto {
  const name = (id: number) => names.get(id) ?? "—";
  return {
    id: t.id,
    code: t.code,
    title: t.title,
    description: t.description,
    category: t.category,
    priority: t.priority,
    status: t.status,
    location: t.location,
    reporter_name: t.reporterName,
    reporter_contact: t.reporterContact,
    created_by: t.createdBy,
    created_by_name: name(t.createdBy),
    assigned_to: t.assignedTo,
    assigned_to_name: t.assignedTo ? name(t.assignedTo) : null,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
    resolved_at: t.resolvedAt?.toISOString() ?? null,
    entries: t.entries.map((e) => ({
      id: e.id ?? 0,
      kind: e.kind,
      author_id: e.authorId,
      author_name: name(e.authorId),
      created_at: e.createdAt.toISOString(),
      body: e.body,
      from_status: e.fromStatus,
      to_status: e.toStatus,
    })),
  };
}

export function ticketsRoutes(tickets: TicketsService, directory: NameDirectory, auth: Authenticator): Router {
  const router = Router();
  router.use("/tickets", requireSession(auth));
  const adminOnly = requireRole("admin");

  const idOf = (raw: string | string[] | undefined): number => {
    const id = Number(raw);
    if (!Number.isInteger(id)) throw invalid("Identificador de ticket inválido");
    return id;
  };

  router.post("/tickets", async (req, res) => {
    const ticket = await tickets.create(currentUser(req).id, parse(newTicketSchema, req.body));
    res.status(201).json(toTicketDto(ticket, await directory.names()));
  });

  router.get("/tickets", async (req, res) => {
    const q = parse(ticketQuerySchema, req.query);
    const page = await tickets.list({
      status: q.status, category: q.category, priority: q.priority, assignedTo: q.assigned_to,
      search: q.q, limit: q.limit, offset: q.offset,
    });
    const names = await directory.names();
    res.json({ items: page.items.map((t) => toTicketDto(t, names)), total: page.total });
  });

  router.get("/tickets/stats", async (_req, res) => {
    res.json({ by_status: await tickets.countsByStatus() });
  });

  router.get("/tickets/:id", async (req, res) => {
    res.json(toTicketDto(await tickets.get(idOf(req.params.id)), await directory.names()));
  });

  router.patch("/tickets/:id/status", adminOnly, async (req, res) => {
    const { status } = parse(statusInSchema, req.body);
    const ticket = await tickets.changeStatus(idOf(req.params.id), status, currentUser(req).id);
    res.json(toTicketDto(ticket, await directory.names()));
  });

  router.patch("/tickets/:id/assign", adminOnly, async (req, res) => {
    const { assignee_id } = parse(assignInSchema, req.body);
    const ticket = await tickets.assign(idOf(req.params.id), assignee_id, currentUser(req).id);
    res.json(toTicketDto(ticket, await directory.names()));
  });

  router.post("/tickets/:id/comments", async (req, res) => {
    const { body } = parse(commentInSchema, req.body);
    const ticket = await tickets.comment(idOf(req.params.id), body, currentUser(req).id);
    res.status(201).json(toTicketDto(ticket, await directory.names()));
  });

  return router;
}
