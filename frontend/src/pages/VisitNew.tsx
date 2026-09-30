import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/endpoints";
import type { VehicleType, VisitType } from "../api/types";
import { ErrorNote, PageHeader } from "../components/ui";
import { cleanPlateInput } from "../format";
import { vehicleLabel, visitTypeLabel } from "../labels";

type Arrival = VehicleType | "none";
const WHO: VisitType[] = ["visitor", "delivery", "provider"];
const HOW: { value: Arrival; label: string }[] = [
  { value: "none", label: "A pie" },
  { value: "motorcycle", label: vehicleLabel.motorcycle },
  { value: "car", label: vehicleLabel.car },
  { value: "truck", label: vehicleLabel.truck },
];
const COMPANIES = ["Uber", "PedidosYa", "Rappi"];

function asVisitType(value: string | null): VisitType {
  return WHO.includes(value as VisitType) ? (value as VisitType) : "visitor";
}
function asArrival(value: string | null, fallback: Arrival): Arrival {
  return HOW.some((h) => h.value === value) ? (value as Arrival) : fallback;
}

function Choice<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="choice">
      <legend>{legend}</legend>
      <div className="choice__options">
        {options.map((option) => (
          <label key={option.value} className={value === option.value ? "is-on" : ""}>
            <input type="radio" name={legend} checked={value === option.value} onChange={() => onChange(option.value)} />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function VisitNew() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const initialType = asVisitType(params.get("tipo"));
  const [visitType, setVisitType] = useState<VisitType>(initialType);
  const [arrival, setArrival] = useState<Arrival>(asArrival(params.get("vehiculo"), initialType === "delivery" ? "motorcycle" : "none"));
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [plate, setPlate] = useState(cleanPlateInput(params.get("placa") ?? ""));
  const [destination, setDestination] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [notes, setNotes] = useState("");

  const register = useMutation({
    mutationFn: api.registerVisit,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["visits"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      navigate(`/visitas/${result.visit.id}`, { replace: true, state: { result } });
    },
  });

  function chooseWho(next: VisitType) {
    setVisitType(next);
    // Lo más común: los deliveries llegan en moto, el resto a pie.
    if (arrival === "none" && next === "delivery") setArrival("motorcycle");
    if (arrival === "motorcycle" && next !== "delivery") setArrival("none");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    register.mutate({
      visit_type: visitType,
      full_name: fullName,
      company: company || null,
      vehicle_type: arrival === "none" ? null : arrival,
      plate: arrival === "none" ? null : plate || null,
      destination: destination || null,
      document_id: documentId || null,
      notes: notes || null,
    });
  }

  const showCompany = visitType !== "visitor";
  return (
    <div className="stack">
      <PageHeader title="Registrar ingreso" />
      <form className="form" onSubmit={submit}>
        <Choice legend="¿Quién llega?" value={visitType} onChange={chooseWho} options={WHO.map((v) => ({ value: v, label: visitTypeLabel[v] }))} />
        <Choice legend="¿Cómo llega?" value={arrival} onChange={setArrival} options={HOW} />

        <label className="field">
          <span>Nombre</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" required />
        </label>

        {arrival !== "none" && (
          <label className="field">
            <span>Placa</span>
            <input
              className="plate-input"
              value={plate}
              onChange={(e) => setPlate(cleanPlateInput(e.target.value))}
              placeholder="PBA-1234"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
            />
            <small>Si no se alcanza a ver, déjala vacía: se compara por tipo de vehículo y hora.</small>
          </label>
        )}

        {showCompany && (
          <div className="field">
            <label htmlFor="company">
              <span>{visitType === "delivery" ? "Plataforma o negocio" : "Empresa"}</span>
            </label>
            <input id="company" value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="off" />
            {visitType === "delivery" && (
              <div className="quick">
                {COMPANIES.map((name) => (
                  <button key={name} type="button" className={company === name ? "is-on" : ""} onClick={() => setCompany(name)}>
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <label className="field">
          <span>Casa o departamento que visita</span>
          <input value={destination} onChange={(e) => setDestination(e.target.value)} autoComplete="off" />
        </label>

        <details className="more">
          <summary>Más datos (cédula, notas)</summary>
          <label className="field">
            <span>Cédula</span>
            <input value={documentId} onChange={(e) => setDocumentId(e.target.value)} inputMode="numeric" autoComplete="off" />
          </label>
          <label className="field">
            <span>Notas</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </label>
        </details>

        <ErrorNote error={register.error} />
        <button className="btn btn--primary btn--block btn--tall" disabled={register.isPending || !fullName.trim()}>
          {register.isPending ? "Registrando…" : "Registrar ingreso"}
        </button>
      </form>
    </div>
  );
}
