"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AUTH_EVENT, api, getTokens, setTokens } from "./api";
import type { TokenPair, User } from "./types";

interface AuthState {
  user: User | null;
  /** True until the stored session has been checked on first load. */
  loading: boolean;
  /** Changes whenever the session changes — use as a dependency to refetch role-based prices. */
  sessionKey: string;
  login: (email: string, password: string) => Promise<User>;
  register: (data: {
    email: string;
    password: string;
    full_name?: string;
    phone?: string;
  }) => Promise<User>;
  logout: () => void;
  setSession: (pair: TokenPair) => void;
  refreshUser: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!getTokens()) {
      setUser(null);
      return;
    }
    try {
      setUser(await api<User>("/me"));
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const initial = getTokens() ? api<User>("/me").catch(() => null) : Promise.resolve(null);
    initial.then((u) => {
      if (cancelled) return;
      setUser(u);
      setLoading(false);
    });
    // Keep tabs in sync and react to token loss (e.g. refresh token expired).
    const onAuth = () => {
      if (!getTokens()) setUser(null);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "kyko.tokens") refreshUser();
    };
    window.addEventListener(AUTH_EVENT, onAuth);
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_EVENT, onAuth);
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshUser]);

  const setSession = useCallback((pair: TokenPair) => {
    setTokens(pair);
    setUser(pair.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const pair = await api<TokenPair>("/auth/login", { body: { email, password } });
      setSession(pair);
      return pair.user;
    },
    [setSession],
  );

  const register = useCallback<AuthState["register"]>(
    async (data) => {
      const pair = await api<TokenPair>("/auth/register", { body: data });
      setSession(pair);
      return pair.user;
    },
    [setSession],
  );

  const logout = useCallback(() => {
    setTokens(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      sessionKey: user ? `${user.id}:${user.role}` : "guest",
      login,
      register,
      logout,
      setSession,
      refreshUser,
      setUser,
    }),
    [user, loading, login, register, logout, setSession, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
