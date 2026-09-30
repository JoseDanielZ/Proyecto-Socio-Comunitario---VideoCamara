import { invalid } from "../../shared/errors";

const MIN_LENGTH = 4;
const MAX_LENGTH = 10;

// Confusiones típicas de OCR (letra <-> dígito) que se ignoran al comparar placas.
const OCR_CONFUSABLE: Record<string, string> = { O: "0", Q: "0", I: "1", S: "5", B: "8", Z: "2" };

/** "abc-1234" -> "ABC1234": mayúsculas y solo letras y dígitos. */
export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Entrada manual: null si viene vacía, error si es inválida. */
export function parsePlate(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const plate = normalizePlate(raw);
  if (!plate) return null;
  if (plate.length < MIN_LENGTH || plate.length > MAX_LENGTH) {
    throw invalid(`Placa inválida: debe tener entre ${MIN_LENGTH} y ${MAX_LENGTH} letras/dígitos`);
  }
  return plate;
}

/** Lectura de cámara: una lectura basura del OCR se trata como "sin placa". */
export function tryParsePlate(raw: string | null | undefined): string | null {
  try {
    return parsePlate(raw);
  } catch {
    return null;
  }
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current.push(Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost));
    }
    previous = current;
  }
  return previous[b.length]!;
}

const canonical = (plate: string) => [...plate].map((c) => OCR_CONFUSABLE[c] ?? c).join("");

/** Misma placa, tolerando un carácter mal leído y las confusiones típicas del OCR. */
export function platesSimilar(a: string, b: string, tolerance = 1): boolean {
  return levenshtein(canonical(a), canonical(b)) <= tolerance;
}
