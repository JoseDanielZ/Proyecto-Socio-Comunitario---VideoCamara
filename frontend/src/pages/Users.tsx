import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../api/endpoints";
import type { Role } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Chip, ErrorNote, Loading, PageHeader } from "../components/ui";
import { roleLabel } from "../labels";

export function Users() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const { data, error, isPending, refetch } = useQuery({ queryKey: ["users"], queryFn: api.users });
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("guard");
  const [password, setPassword] = useState("");

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["users"] });
  const create = useMutation({
    mutationFn: api.createUser,
    onSuccess: () => {
      setUsername("");
      setFullName("");
      setPassword("");
      refresh();
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => api.updateUser(id, { is_active: active }),
    onSuccess: refresh,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate({ username, full_name: fullName, role, password });
  }

  return (
    <div className="stack">
      <PageHeader title="Usuarios" />
      {isPending && <Loading />}
      <ErrorNote error={error} onRetry={() => void refetch()} />

      <ul className="list">
        {data?.map((u) => (
          <li key={u.id} className="row">
            <div className="row__main">
              <p className="row__title">{u.full_name}</p>
              <p className="row__meta">
                {u.username} · {roleLabel[u.role]}
              </p>
            </div>
            {!u.is_active && <Chip tone="quiet">Desactivado</Chip>}
            {u.id !== me?.id && (
              <button className="btn btn--small" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: u.id, active: !u.is_active })}>
                {u.is_active ? "Desactivar" : "Activar"}
              </button>
            )}
          </li>
        ))}
      </ul>
      <ErrorNote error={toggle.error} />

      <form className="form" onSubmit={submit}>
        <h2 className="section-title">Agregar una persona</h2>
        <label className="field">
          <span>Nombre completo</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="off" />
        </label>
        <label className="field">
          <span>Usuario</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} required autoCapitalize="none" autoComplete="off" />
        </label>
        <label className="field">
          <span>Contraseña (mínimo 6 caracteres)</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required autoComplete="new-password" />
        </label>
        <label className="field">
          <span>Rol</span>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="guard">{roleLabel.guard}</option>
            <option value="admin">{roleLabel.admin}</option>
          </select>
        </label>
        <ErrorNote error={create.error} />
        <button className="btn btn--primary btn--block" disabled={create.isPending}>
          {create.isPending ? "Creando…" : "Crear usuario"}
        </button>
      </form>
    </div>
  );
}
