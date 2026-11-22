import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError, api, loadTokens, onSignedOut, setTokens } from "./api";
import { forgetPush, syncPush } from "./notifications";
import { prefs } from "./storage";
import type { TokenPair, User } from "./types";

const USER_KEY = "kyko.user";

export interface RegisterData {
  email: string;
  password: string;
  full_name?: string | null;
  phone?: string | null;
}

interface AuthState {
  /** The signed-in customer (the last known profile while offline), or null for a guest. */
  user: User | null;
  /** False until the saved session has been read: screens wait for it before loading prices. */
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: RegisterData) => Promise<User>;
  logout: () => Promise<void>;
  /** After the profile changed on the server (profile form, upgrade request). */
  setUser: (user: User) => void;
  /** After a password change: the server hands out new tokens and ends other sessions. */
  setSession: (pair: TokenPair) => Promise<void>;
  /** Re-read the profile, e.g. to see a role an admin has just granted. */
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUserState] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const roleRef = useRef<string | null>(null);

  // Prices depend on the role, so every cached response is dropped when it changes.
  const applyUser = useCallback(
    (next: User | null) => {
      setUserState(next);
      void prefs.set(USER_KEY, next);
      const role = next ? `${next.id}:${next.role}` : null;
      if (roleRef.current !== role) {
        roleRef.current = role;
        void queryClient.resetQueries();
      }
    },
    [queryClient],
  );

  const reload = useCallback(async () => {
    try {
      applyUser(await api<User>("/me"));
    } catch (err) {
      // 401 after a failed refresh: the session is over. Other errors: offline, keep it.
      if (err instanceof ApiError && err.status === 401) {
        await setTokens(null);
        applyUser(null);
      }
    }
  }, [applyUser]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const signedIn = await loadTokens();
      const cached = signedIn ? await prefs.get<User | null>(USER_KEY, null) : null;
      if (!alive) return;
      roleRef.current = cached ? `${cached.id}:${cached.role}` : null;
      setUserState(cached);
      setReady(true);
      if (signedIn) {
        await reload();
        void syncPush();
      }
    })();
    return () => {
      alive = false;
    };
  }, [reload]);

  useEffect(() => onSignedOut(() => applyUser(null)), [applyUser]);

  const setSession = useCallback(
    async (pair: TokenPair) => {
      await setTokens(pair);
      applyUser(pair.user);
      // This phone now gets this customer's order notifications (if they are allowed).
      void syncPush();
    },
    [applyUser],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const pair = await api<TokenPair>("/auth/login", { body: { email, password } });
      await setSession(pair);
      return pair.user;
    },
    [setSession],
  );

  const register = useCallback(
    async (data: RegisterData) => {
      const pair = await api<TokenPair>("/auth/register", { body: data });
      await setSession(pair);
      return pair.user;
    },
    [setSession],
  );

  const logout = useCallback(async () => {
    await forgetPush();
    await setTokens(null);
    applyUser(null);
  }, [applyUser]);

  const value = useMemo<AuthState>(
    () => ({ user, ready, login, register, logout, setUser: applyUser, setSession, reload }),
    [user, ready, login, register, logout, applyUser, setSession, reload],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
