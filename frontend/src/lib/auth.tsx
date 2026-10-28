/**
 * AuthProvider keeps the logged-in user in React state.
 * On first load it tries /auth/refresh: if the refresh cookie is still valid,
 * the user stays logged in after a page reload without typing their password again.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, logoutRequest, refreshSession, registerAuthListener, setSession } from "./api";
import type { Role, TokenResponse, User } from "./types";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  user: User | null;
  status: Status;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { email: string; password: string; full_name: string; role: Role }) => Promise<User>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    registerAuthListener((u) => {
      setUser(u);
      setStatus(u ? "authenticated" : "anonymous");
    });
    void refreshSession();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<TokenResponse>("/auth/login", { method: "POST", body: { email, password } });
    setSession(data);
    return data.user;
  }, []);

  const register = useCallback(
    async (body: { email: string; password: string; full_name: string; role: Role }) => {
      const data = await api<TokenResponse>("/auth/register", { method: "POST", body });
      setSession(data);
      return data.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    await logoutRequest();
  }, []);

  const reloadUser = useCallback(async () => {
    const me = await api<User>("/auth/me");
    setUser(me);
  }, []);

  const value = useMemo(
    () => ({ user, status, login, register, logout, reloadUser }),
    [user, status, login, register, logout, reloadUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
