import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { CameraMatch, Visit } from "../api/types";
import { Verdict } from "./Verdict";

const visit: Visit = {
  id: 1, visit_type: "delivery", full_name: "Luis Mora", document_id: null, company: "Uber",
  plate: "PBA123C", vehicle_type: "motorcycle", destination: "Casa 5", host_name: null, notes: null,
  entered_at: "2026-09-29T14:00:00Z", exited_at: null, is_active: true, registered_by: 1,
  camera_event_id: null, match_status: "possible",
};
const event = {
  id: 9, camera_id: "entrada", occurred_at: "2026-09-29T14:00:00Z", vehicle_type: "motorcycle" as const,
  color: "negro", plate_text: null, plate_confidence: null, direction: null, snapshot_url: "/api/vehicle-events/9/snapshot",
};

const renderVerdict = (match: CameraMatch, props = {}) =>
  render(
    <MemoryRouter>
      <Verdict visit={visit} match={match} {...props} />
    </MemoryRouter>,
  );

describe("Verdict", () => {
  it("respaldado: título claro, sin botones de acción", () => {
    renderVerdict({ status: "verified", reason: "La cámara leyó esta placa", event }, { onConfirm: vi.fn(), onRecheck: vi.fn() });
    expect(screen.getByRole("heading", { name: "Respaldado por cámara" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/Moto negro/)).toBeInTheDocument();
  });

  it("posible: el guardia puede confirmar con la foto o volver a comprobar", async () => {
    const onConfirm = vi.fn();
    const onRecheck = vi.fn();
    renderVerdict({ status: "possible", reason: "No pudo leer la placa", event }, { onConfirm, onRecheck });
    expect(screen.getByRole("img", { name: /Moto negro/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sí, es el mismo vehículo" }));
    await userEvent.click(screen.getByRole("button", { name: /Volver a comprobar/ }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onRecheck).toHaveBeenCalledOnce();
  });

  it("sin respaldo: ofrece volver a comprobar y no pide confirmar", () => {
    renderVerdict({ status: "no_camera_evidence", reason: "La cámara no registró ningún vehículo en ±10 min", event: null }, { onConfirm: vi.fn(), onRecheck: vi.fn() });
    expect(screen.getByRole("heading", { name: "Sin respaldo de cámara" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Volver a comprobar/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mismo vehículo/ })).not.toBeInTheDocument();
  });

  it("el resultado se anuncia a lectores de pantalla", () => {
    renderVerdict({ status: "no_camera_evidence", reason: "x", event: null });
    expect(screen.getByLabelText("Resultado de la cámara")).toHaveAttribute("aria-live", "polite");
  });
});
