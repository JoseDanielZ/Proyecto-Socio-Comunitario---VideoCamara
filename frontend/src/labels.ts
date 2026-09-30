import type {
  MatchStatus,
  Role,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  VehicleType,
  VisitType,
} from "./api/types";

export const CONJUNTO_NAME = import.meta.env.VITE_CONJUNTO_NAME ?? "Conjunto";

export const vehicleLabel: Record<VehicleType, string> = {
  car: "Auto",
  motorcycle: "Moto",
  bus: "Bus",
  truck: "Camión",
};

export const visitTypeLabel: Record<VisitType, string> = {
  visitor: "Visita",
  delivery: "Delivery",
  provider: "Proveedor",
};

export const matchLabel: Record<MatchStatus, string> = {
  verified: "Respaldado por cámara",
  possible: "Posible coincidencia",
  no_camera_evidence: "Sin respaldo de cámara",
  not_applicable: "Sin vehículo",
};

export const statusLabel: Record<TicketStatus, string> = {
  open: "Abierto",
  in_progress: "En proceso",
  resolved: "Resuelto",
  closed: "Cerrado",
};

export const priorityLabel: Record<TicketPriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

export const categoryLabel: Record<TicketCategory, string> = {
  damage: "Daño",
  maintenance: "Mantenimiento",
  security: "Seguridad",
  noise: "Ruido",
  cleaning: "Limpieza",
  other: "Otro",
};

export const roleLabel: Record<Role, string> = { admin: "Administración", guard: "Guardia" };

/** Estados a los que puede pasar un ticket (igual que las reglas del backend). */
export const nextStatuses: Record<TicketStatus, TicketStatus[]> = {
  open: ["in_progress", "closed"],
  in_progress: ["open", "resolved", "closed"],
  resolved: ["in_progress", "closed"],
  closed: [],
};

/** Acción que el botón de cada estado realiza (verbo, no el nombre del estado). */
export const statusAction: Record<TicketStatus, string> = {
  open: "Reabrir",
  in_progress: "Empezar",
  resolved: "Marcar resuelto",
  closed: "Cerrar",
};
