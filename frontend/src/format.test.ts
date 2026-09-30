import { cleanPlateInput, duration, formatPlate, formatWhen, initials, timeAgo } from "./format";

const NOW = new Date("2026-09-29T15:00:00");

describe("placas", () => {
  it("muestra placas de auto con guion y deja las de moto como están", () => {
    expect(formatPlate("PBA1234")).toBe("PBA-1234");
    expect(formatPlate("AB123C")).toBe("AB123C");
    expect(formatPlate(null)).toBe("");
  });

  it("limpia lo que se escribe: mayúsculas, sin símbolos raros, máximo 10", () => {
    expect(cleanPlateInput("pba 12#34")).toBe("PBA1234");
    expect(cleanPlateInput("abcdefghijklmnop")).toHaveLength(10);
  });
});

describe("tiempos", () => {
  it("dice hace cuánto pasó algo", () => {
    expect(timeAgo("2026-09-29T14:59:40", NOW)).toBe("ahora");
    expect(timeAgo("2026-09-29T14:55:00", NOW)).toBe("hace 5 min");
    expect(timeAgo("2026-09-29T12:00:00", NOW)).toBe("hace 3 h");
    expect(timeAgo("2026-09-27T15:00:00", NOW)).toBe("hace 2 d");
  });

  it("no muestra tiempos negativos si el reloj del servidor va adelantado", () => {
    expect(timeAgo("2026-09-29T15:00:30", NOW)).toBe("ahora");
  });

  it("separa hoy, ayer y otras fechas", () => {
    expect(formatWhen("2026-09-29T09:05:00", NOW)).toBe("hoy 09:05");
    expect(formatWhen("2026-09-28T18:30:00", NOW)).toBe("ayer 18:30");
    expect(formatWhen("2026-09-10T08:00:00", NOW)).toMatch(/^10 sep\w* 08:00$/);
  });

  it("formatea duraciones", () => {
    expect(duration("2026-09-29T14:25:00", null, NOW)).toBe("35 min");
    expect(duration("2026-09-29T12:50:00", "2026-09-29T15:00:00")).toBe("2 h 10 min");
    expect(duration("2026-09-29T13:00:00", "2026-09-29T15:00:00")).toBe("2 h");
  });
});

describe("iniciales", () => {
  it("toma hasta dos", () => {
    expect(initials("Guardia turno día")).toBe("GT");
    expect(initials("admin")).toBe("A");
    expect(initials("")).toBe("");
  });
});
