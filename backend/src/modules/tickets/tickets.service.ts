import type { NewTicket, TicketCategory, TicketPriority, TicketStatus } from "@conjunto/contracts";
import { notFound, invalid } from "../../shared/errors";
import { systemClock, type Clock } from "../../shared/time";
import { creationEntry, withAssignee, withComment, withStatus, type Ticket } from "./tickets.rules";

export interface TicketFilter {
  status?: TicketStatus;
  category?: TicketCategory;
  priority?: TicketPriority;
  assignedTo?: number;
  /** Código, título o ubicación. */
  search?: string;
  limit: number;
  offset: number;
}

export interface TicketStore {
  /** Asigna el id y el código correlativo (TCK-0001) al guardar. */
  add(ticket: Omit<Ticket, "id" | "code">): Promise<Ticket>;
  get(id: number): Promise<Ticket | null>;
  /** Guarda los cambios del ticket y las entradas nuevas de su historial. */
  save(ticket: Ticket): Promise<Ticket>;
  search(filter: TicketFilter): Promise<Ticket[]>;
  count(filter: TicketFilter): Promise<number>;
  countsByStatus(): Promise<Partial<Record<TicketStatus, number>>>;
}

/** Lo único que se necesita saber de los usuarios: si la persona asignada existe y está activa. */
export interface AssigneeCheck {
  isActive(userId: number): Promise<boolean>;
}

const clean = (v: string | null | undefined) => v?.trim() || null;

export class TicketsService {
  constructor(
    private readonly store: TicketStore,
    private readonly users: AssigneeCheck,
    private readonly clock: Clock = systemClock,
  ) {}

  async create(authorId: number, input: NewTicket): Promise<Ticket> {
    const now = this.clock();
    const title = input.title.trim();
    if (!title) throw invalid("El título del ticket es obligatorio");
    const description = (input.description ?? "").trim();
    return this.store.add({
      title,
      description,
      category: input.category ?? "other",
      priority: input.priority ?? "medium",
      status: "open",
      location: clean(input.location),
      reporterName: clean(input.reporter_name),
      reporterContact: clean(input.reporter_contact),
      createdBy: authorId,
      assignedTo: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      entries: [creationEntry(authorId, now, description)],
    });
  }

  async get(id: number): Promise<Ticket> {
    const ticket = await this.store.get(id);
    if (!ticket) throw notFound("Ticket no encontrado");
    return ticket;
  }

  async list(filter: TicketFilter): Promise<{ items: Ticket[]; total: number }> {
    const [items, total] = await Promise.all([this.store.search(filter), this.store.count(filter)]);
    return { items, total };
  }

  async changeStatus(id: number, status: TicketStatus, authorId: number): Promise<Ticket> {
    return this.store.save(withStatus(await this.get(id), status, authorId, this.clock()));
  }

  async assign(id: number, assigneeId: number | null, authorId: number): Promise<Ticket> {
    if (assigneeId !== null && !(await this.users.isActive(assigneeId))) {
      throw invalid("La persona asignada no existe o está inactiva");
    }
    return this.store.save(withAssignee(await this.get(id), assigneeId, authorId, this.clock()));
  }

  async comment(id: number, body: string, authorId: number): Promise<Ticket> {
    return this.store.save(withComment(await this.get(id), body, authorId, this.clock()));
  }

  async countsByStatus(): Promise<Record<TicketStatus, number>> {
    const counts = await this.store.countsByStatus();
    return { open: 0, in_progress: 0, resolved: 0, closed: 0, ...counts };
  }
}
