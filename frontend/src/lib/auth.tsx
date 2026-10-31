import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, auth } from "./api";
import { safeStorage } from "./utils";

export type Role = "admin" | "sales" | "technician" | "warehouse" | "support" | "accounts";
export type User = { id: number; name: string; email: string; role: Role; phone?: string; hourly_rate?: number };

type Ctx = { user: User | null; loading: boolean; login: (email: string, password: string) => Promise<User>; logout: () => void };
const AuthContext = createContext<Ctx | null>(null);
const KEY = "suryaops-session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const logout = useCallback(() => {
    auth.setToken(null);
    safeStorage.remove(KEY);
    setUser(null);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    auth.onUnauthorized(logout);
    const saved = safeStorage.get(KEY);
    if (!saved) { setLoading(false); return; }
    auth.setToken(saved);
    api<User>("/auth/me").then(setUser).catch(() => logout()).finally(() => setLoading(false));
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ access_token: string; user: User }>("/auth/login", { body: { email, password } });
    auth.setToken(res.access_token);
    safeStorage.set(KEY, res.access_token);
    setUser(res.user);
    return res.user;
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

/** Admin can do everything; otherwise the role must be listed. Mirrors require_roles() on the server. */
export function can(user: User | null, ...roles: Role[]) {
  return !!user && (user.role === "admin" || roles.includes(user.role));
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Director", sales: "Sales", technician: "Technician", warehouse: "Warehouse", support: "Support", accounts: "Accounts",
};

export const HOME_FOR: Record<Role, string> = {
  admin: "/dashboard", sales: "/leads", technician: "/jobs", warehouse: "/dispatch", support: "/tickets", accounts: "/invoices",
};
