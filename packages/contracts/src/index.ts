/**
 * Contrato de la API del conjunto. Es la ÚNICA definición de los datos que viajan entre backend y frontend:
 *  - el backend valida las entradas y comprueba las salidas con estos esquemas;
 *  - el frontend importa solo los tipos (`import type`), así que un cambio aquí rompe la compilación de
 *    quien no se haya adaptado.
 * Los nombres de campo van en snake_case porque así viajan en el JSON.
 */
import { z } from "zod";

// ------------------------------------------------------------------ enumeraciones
export const roleSchema = z.enum(["admin", "guard"]);
export const vehicleTypeSchema = z.enum(["car", "motorcycle", "bus", "truck"]);
export const visitTypeSchema = z.enum(["visitor", "delivery", "provider"]);
export const matchStatusSchema = z.enum(["verified", "possible", "no_camera_evidence", "not_applicable"]);
export const ticketStatusSchema = z.enum(["open", "in_progress", "resolved", "closed"]);
export const ticketPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export const ticketCategorySchema = z.enum(["damage", "maintenance", "security", "noise", "cleaning", "other"]);
export const ticketEntryKindSchema = z.enum(["created", "comment", "status_change", "assignment"]);
export const cameraStatusSchema = z.enum(["running", "starting", "finished", "stopped", "error", "disabled"]);

export type Role = z.infer<typeof roleSchema>;
export type VehicleType = z.infer<typeof vehicleTypeSchema>;
export type VisitType = z.infer<typeof visitTypeSchema>;
export type MatchStatus = z.infer<typeof matchStatusSchema>;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;
export type TicketCategory = z.infer<typeof ticketCategorySchema>;
export type TicketEntryKind = z.infer<typeof ticketEntryKindSchema>;
export type CameraStatus = z.infer<typeof cameraStatusSchema>;

/** Fecha y hora ISO 8601 en UTC, p. ej. "2026-09-29T14:00:00.000Z". */
const isoDate = z.string();

export const pageSchema = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), total: z.number().int() });
export type Page<T> = { items: T[]; total: number };

// ------------------------------------------------------------- sesión y usuarios
export const loginInSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(200),
});

export const userSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  full_name: z.string(),
  role: roleSchema,
  is_active: z.boolean(),
});
export type User = z.infer<typeof userSchema>;

export const sessionSchema = z.object({ access_token: z.string(), user: userSchema });
export type Session = z.infer<typeof sessionSchema>;

export const userCreateSchema = z.object({
  username: z.string().min(3).max(50),
  full_name: z.string().min(1).max(120),
  role: roleSchema,
  password: z.string().min(6).max(200),
});
export type NewUser = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  full_name: z.string().min(1).max(120).optional(),
  role: roleSchema.optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(6).max(200).optional(),
});
export type UserUpdate = z.infer<typeof userUpdateSchema>;

// ------------------------------------------------------------- eventos de cámara
export const vehicleEventSchema = z.object({
  id: z.number().int(),
  camera_id: z.string(),
  occurred_at: isoDate,
  vehicle_type: vehicleTypeSchema,
  color: z.string().nullable(),
  plate_text: z.string().nullable(),
  plate_confidence: z.number().nullable(),
  direction: z.string().nullable(),
  /** Requiere ?access_token=... cuando se usa en un <img>. */
  snapshot_url: z.string().nullable(),
});
export type VehicleEvent = z.infer<typeof vehicleEventSchema>;

export const vehicleEventPageSchema = pageSchema(vehicleEventSchema);

export const vehicleEventSummarySchema = z.object({
  total: z.number().int(),
  by_type: z.record(z.string(), z.number().int()),
  by_color: z.record(z.string(), z.number().int()),
  by_hour: z.record(z.string(), z.number().int()),
});
export type VehicleEventSummary = z.infer<typeof vehicleEventSummarySchema>;

export const vehicleEventQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  plate: z.string().max(20).optional(),
  type: vehicleTypeSchema.optional(),
  color: z.string().max(30).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const summaryQuerySchema = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });

// ------------------------------------------------------------------------ cámaras
export const cameraSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: cameraStatusSchema,
  detail: z.string().nullable(),
  crossings: z.number().int(),
});
export type Camera = z.infer<typeof cameraSchema>;

/** Lo que envía el motor de visión (Python) por cada vehículo que cruza la línea. */
export const ingestEventSchema = z.object({
  camera_id: z.string().min(1).max(50),
  occurred_at: z.coerce.date(),
  vehicle_type: vehicleTypeSchema,
  color: z.string().max(30).nullish(),
  plate_text: z.string().max(20).nullish(),
  plate_confidence: z.number().nullish(),
  direction: z.string().max(20).nullish(),
  tracker_id: z.number().int().nullish(),
  /** Solo el nombre del archivo dentro de la carpeta de fotos (nunca una ruta). */
  snapshot_file: z.string().regex(/^[\w.-]+\.jpg$/).nullish(),
});
export type IngestEvent = z.infer<typeof ingestEventSchema>;

export const ingestStatusSchema = z.object({
  status: cameraStatusSchema,
  detail: z.string().max(300).nullish(),
  crossings: z.number().int().min(0).default(0),
});
export type IngestStatus = z.infer<typeof ingestStatusSchema>;

// ------------------------------------------------------------------------- visitas
export const newVisitSchema = z.object({
  visit_type: visitTypeSchema,
  full_name: z.string().min(1).max(120),
  document_id: z.string().max(30).nullish(),
  company: z.string().max(80).nullish(),
  plate: z.string().max(20).nullish(),
  vehicle_type: vehicleTypeSchema.nullish(),
  destination: z.string().max(120).nullish(),
  host_name: z.string().max(120).nullish(),
  notes: z.string().max(1000).nullish(),
});
export type NewVisit = z.infer<typeof newVisitSchema>;

export const visitSchema = z.object({
  id: z.number().int(),
  visit_type: visitTypeSchema,
  full_name: z.string(),
  document_id: z.string().nullable(),
  company: z.string().nullable(),
  plate: z.string().nullable(),
  vehicle_type: vehicleTypeSchema.nullable(),
  destination: z.string().nullable(),
  host_name: z.string().nullable(),
  notes: z.string().nullable(),
  entered_at: isoDate,
  exited_at: isoDate.nullable(),
  is_active: z.boolean(),
  registered_by: z.number().int(),
  camera_event_id: z.number().int().nullable(),
  match_status: matchStatusSchema,
});
export type Visit = z.infer<typeof visitSchema>;

export const cameraMatchSchema = z.object({
  status: matchStatusSchema,
  reason: z.string(),
  event: vehicleEventSchema.nullable(),
});
export type CameraMatch = z.infer<typeof cameraMatchSchema>;

export const visitWithMatchSchema = z.object({ visit: visitSchema, camera_match: cameraMatchSchema });
export type VisitWithMatch = z.infer<typeof visitWithMatchSchema>;

export const visitPageSchema = pageSchema(visitSchema);

export const confirmEventSchema = z.object({ event_id: z.number().int() });

export const visitQuerySchema = z.object({
  active: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  type: visitTypeSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const unmatchedQuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(72).default(2),
  type: vehicleTypeSchema.default("motorcycle"),
});

// ------------------------------------------------------------------------- tickets
export const newTicketSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(4000).default(""),
  category: ticketCategorySchema.default("other"),
  priority: ticketPrioritySchema.default("medium"),
  location: z.string().max(120).nullish(),
  reporter_name: z.string().max(120).nullish(),
  reporter_contact: z.string().max(80).nullish(),
});
export type NewTicket = z.input<typeof newTicketSchema>;

export const statusInSchema = z.object({ status: ticketStatusSchema });
export const assignInSchema = z.object({ assignee_id: z.number().int().nullable() });
export const commentInSchema = z.object({ body: z.string().min(1).max(2000) });

export const ticketEntrySchema = z.object({
  id: z.number().int(),
  kind: ticketEntryKindSchema,
  author_id: z.number().int(),
  author_name: z.string(),
  created_at: isoDate,
  body: z.string().nullable(),
  from_status: ticketStatusSchema.nullable(),
  to_status: ticketStatusSchema.nullable(),
});
export type TicketEntry = z.infer<typeof ticketEntrySchema>;

export const ticketSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  title: z.string(),
  description: z.string(),
  category: ticketCategorySchema,
  priority: ticketPrioritySchema,
  status: ticketStatusSchema,
  location: z.string().nullable(),
  reporter_name: z.string().nullable(),
  reporter_contact: z.string().nullable(),
  created_by: z.number().int(),
  created_by_name: z.string(),
  assigned_to: z.number().int().nullable(),
  assigned_to_name: z.string().nullable(),
  created_at: isoDate,
  updated_at: isoDate,
  resolved_at: isoDate.nullable(),
  entries: z.array(ticketEntrySchema),
});
export type Ticket = z.infer<typeof ticketSchema>;

export const ticketPageSchema = pageSchema(ticketSchema);

export const ticketStatsSchema = z.object({ by_status: z.record(ticketStatusSchema, z.number().int()) });
export type TicketStats = z.infer<typeof ticketStatsSchema>;

export const ticketQuerySchema = z.object({
  status: ticketStatusSchema.optional(),
  category: ticketCategorySchema.optional(),
  priority: ticketPrioritySchema.optional(),
  assigned_to: z.coerce.number().int().optional(),
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ------------------------------------------------------------------------ dashboard
export const dashboardSchema = z.object({
  vehicles_today: z.number().int(),
  vehicles_today_by_type: z.record(z.string(), z.number().int()),
  active_visits: z.number().int(),
  tickets_by_status: z.record(ticketStatusSchema, z.number().int()),
  /** Motos que la cámara vio en las últimas 2 h y ningún guardia registró. */
  unregistered_motorcycles: z.array(vehicleEventSchema),
  camera: cameraSchema.nullable(),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
