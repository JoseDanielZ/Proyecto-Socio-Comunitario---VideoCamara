// Tipos que reflejan los DTOs del backend (backend/app/presentation/schemas/dto.py).

export type Role = "admin" | "guard";
export type VehicleType = "car" | "motorcycle" | "bus" | "truck";
export type VisitType = "visitor" | "delivery" | "provider";
export type MatchStatus = "verified" | "possible" | "no_camera_evidence" | "not_applicable";
export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketCategory = "damage" | "maintenance" | "security" | "noise" | "cleaning" | "other";
export type TicketEntryKind = "created" | "comment" | "status_change" | "assignment";

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
}

export interface Session {
  access_token: string;
  user: User;
}

export interface VehicleEvent {
  id: number;
  camera_id: string;
  occurred_at: string;
  vehicle_type: VehicleType;
  color: string | null;
  plate_text: string | null;
  plate_confidence: number | null;
  direction: string | null;
  snapshot_url: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
}

export interface VehicleEventSummary {
  total: number;
  by_type: Record<string, number>;
  by_color: Record<string, number>;
  by_hour: Record<string, number>;
}

export interface Camera {
  id: string;
  name: string;
  status: "running" | "starting" | "finished" | "stopped" | "error" | "disabled";
  detail: string | null;
  crossings: number;
}

export interface Visit {
  id: number;
  visit_type: VisitType;
  full_name: string;
  document_id: string | null;
  company: string | null;
  plate: string | null;
  vehicle_type: VehicleType | null;
  destination: string | null;
  host_name: string | null;
  notes: string | null;
  entered_at: string;
  exited_at: string | null;
  is_active: boolean;
  registered_by: number;
  camera_event_id: number | null;
  match_status: MatchStatus;
}

export interface CameraMatch {
  status: MatchStatus;
  reason: string;
  event: VehicleEvent | null;
}

export interface VisitWithMatch {
  visit: Visit;
  camera_match: CameraMatch;
}

export interface NewVisit {
  visit_type: VisitType;
  full_name: string;
  document_id?: string | null;
  company?: string | null;
  plate?: string | null;
  vehicle_type?: VehicleType | null;
  destination?: string | null;
  host_name?: string | null;
  notes?: string | null;
}

export interface TicketEntry {
  id: number;
  kind: TicketEntryKind;
  author_id: number;
  author_name: string;
  created_at: string;
  body: string | null;
  from_status: TicketStatus | null;
  to_status: TicketStatus | null;
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
  reporter_name: string | null;
  reporter_contact: string | null;
  created_by: number;
  created_by_name: string;
  assigned_to: number | null;
  assigned_to_name: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  entries: TicketEntry[];
}

export interface NewTicket {
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  location?: string | null;
  reporter_name?: string | null;
  reporter_contact?: string | null;
}

export interface Dashboard {
  vehicles_today: number;
  vehicles_today_by_type: Record<string, number>;
  active_visits: number;
  tickets_by_status: Record<TicketStatus, number>;
  unregistered_motorcycles: VehicleEvent[];
  camera: Camera | null;
}
