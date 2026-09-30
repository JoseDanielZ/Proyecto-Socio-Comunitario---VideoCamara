import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../api/endpoints";
import { loadSession, saveSession, setUnauthorizedHandler } from "../api/client";
import type { Session, User } from "../api/types";

interface AuthValue {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const queryClient = useQueryClient();

  const logout = useCallback(() => {
    saveSession(null);
    setSession(null);
    queryClient.clear(); // no dejar datos de la sesión anterior en memoria
  }, [queryClient]);

  useEffect(() => setUnauthorizedHandler(logout), [logout]);

  const login = useCallback(async (username: string, password: string) => {
    const next = await api.login(username.trim(), password);
    saveSession(next);
    setSession(next);
  }, []);

  const value = useMemo(() => ({ user: session?.user ?? null, login, logout }), [session, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return value;
}
