import { request } from "./client";
import type {
  Camera,
  CameraMatch,
  Dashboard,
  NewTicket,
  NewVisit,
  Page,
  Role,
  Session,
  Ticket,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  User,
  VehicleEvent,
  VehicleEventSummary,
  VehicleType,
  Visit,
  VisitType,
  VisitWithMatch,
} from "./types";

export const api = {
  login: (username: string, password: string) =>
    request<Session>("POST", "/auth/login", { body: { username, password } }),

  dashboard: () => request<Dashboard>("GET", "/dashboard"),

  cameras: () => request<Camera[]>("GET", "/cameras"),

  vehicleEvents: (query: { plate?: string; type?: VehicleType | ""; color?: string; from?: string; to?: string; limit?: number; offset?: number }) =>
    request<Page<VehicleEvent>>("GET", "/vehicle-events", { query }),
  vehicleEventsSummary: (query: { from?: string; to?: string }) =>
    request<VehicleEventSummary>("GET", "/vehicle-events/summary", { query }),

  visits: (query: { active?: boolean; type?: VisitType | ""; q?: string; limit?: number; offset?: number }) =>
    request<Page<Visit>>("GET", "/visits", { query }),
  visit: (id: number) => request<Visit>("GET", `/visits/${id}`),
  registerVisit: (body: NewVisit) => request<VisitWithMatch>("POST", "/visits", { body }),
  exitVisit: (id: number) => request<Visit>("PATCH", `/visits/${id}/exit`),
  recheckVisit: (id: number) => request<VisitWithMatch>("GET", `/visits/${id}/camera-match`),
  confirmVisitEvent: (id: number, eventId: number) =>
    request<VisitWithMatch>("POST", `/visits/${id}/confirm-camera-event`, { body: { event_id: eventId } }),
  unmatchedVehicles: (hours = 2) =>
    request<VehicleEvent[]>("GET", "/visits/unmatched-vehicles", { query: { hours } }),

  tickets: (query: { status?: TicketStatus | ""; category?: TicketCategory | ""; priority?: TicketPriority | ""; q?: string; limit?: number; offset?: number }) =>
    request<Page<Ticket>>("GET", "/tickets", { query }),
  ticketStats: () => request<{ by_status: Record<TicketStatus, number> }>("GET", "/tickets/stats"),
  ticket: (id: number) => request<Ticket>("GET", `/tickets/${id}`),
  createTicket: (body: NewTicket) => request<Ticket>("POST", "/tickets", { body }),
  setTicketStatus: (id: number, status: TicketStatus) =>
    request<Ticket>("PATCH", `/tickets/${id}/status`, { body: { status } }),
  assignTicket: (id: number, assigneeId: number | null) =>
    request<Ticket>("PATCH", `/tickets/${id}/assign`, { body: { assignee_id: assigneeId } }),
  commentTicket: (id: number, body: string) =>
    request<Ticket>("POST", `/tickets/${id}/comments`, { body: { body } }),

  users: () => request<User[]>("GET", "/users"),
  createUser: (body: { username: string; full_name: string; role: Role; password: string }) =>
    request<User>("POST", "/users", { body }),
  updateUser: (id: number, body: { full_name?: string; role?: Role; is_active?: boolean; password?: string }) =>
    request<User>("PATCH", `/users/${id}`, { body }),
};

export type { CameraMatch };
