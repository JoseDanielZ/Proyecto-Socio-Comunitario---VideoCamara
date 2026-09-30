const TIME = new Intl.DateTimeFormat("es-EC", { hour: "2-digit", minute: "2-digit", hour12: false });
const DAY = new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short" });

export function formatTime(iso: string): string {
  return TIME.format(new Date(iso));
}

/** "hoy 14:05", "ayer 09:30" o "29 sept 14:05". */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, now)) return `hoy ${formatTime(iso)}`;
  if (sameDay(date, yesterday)) return `ayer ${formatTime(iso)}`;
  return `${DAY.format(date).replace(".", "")} ${formatTime(iso)}`;
}

/** "hace 3 min", "hace 2 h"; menos de 1 minuto: "ahora". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "ahora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

/** Duración legible entre dos instantes: "35 min", "2 h 10 min". */
export function duration(fromIso: string, toIso?: string | null, now: Date = new Date()): string {
  const end = toIso ? new Date(toIso) : now;
  const minutes = Math.max(0, Math.round((end.getTime() - new Date(fromIso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${Math.floor(minutes / 60)} h`;
}

/** Placas de auto (3 letras + 3-4 números) se muestran con guion: PBA-1234. Las demás, tal cual. */
export function formatPlate(plate: string | null | undefined): string {
  if (!plate) return "";
  const match = /^([A-Z]{3})(\d{3,4})$/.exec(plate);
  return match ? `${match[1]}-${match[2]}` : plate;
}

/** Mayúsculas y solo letras/números mientras se escribe la placa. */
export function cleanPlateInput(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 10);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
