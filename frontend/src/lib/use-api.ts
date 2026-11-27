"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, api, type RequestOptions } from "./api";
import { useAuth } from "./auth";

interface ApiState<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

interface Result<T> {
  key: string | null;
  data: T | undefined;
  error: ApiError | null;
}

/**
 * GET a resource and refetch it when the path/options or the session (role => prices) change.
 * Pass `null` as path to skip the request. Previous data stays visible while reloading.
 */
export function useApi<T>(path: string | null, opts?: RequestOptions): ApiState<T> {
  const { sessionKey, loading: authLoading } = useAuth();
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<Result<T>>({ key: null, data: undefined, error: null });
  const optsKey = JSON.stringify(opts ?? {});
  const key = path === null ? null : JSON.stringify([path, optsKey, sessionKey, nonce]);

  useEffect(() => {
    // Wait for the stored session so the first request already has the right role.
    if (key === null || path === null || authLoading) return;
    let cancelled = false;
    api<T>(path, JSON.parse(optsKey))
      .then((data) => {
        if (!cancelled) setResult({ key, data, error: null });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const error = e instanceof ApiError ? e : new ApiError(0, String(e), null);
        setResult({ key, data: undefined, error });
      });
    return () => {
      cancelled = true;
    };
  }, [key, path, optsKey, authLoading]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return {
    data: result.data,
    error: result.error,
    loading: authLoading || (key !== null && result.key !== key),
    reload,
  };
}

interface AllResult<T> {
  key: string | null;
  data: (T | null)[] | undefined;
}

/**
 * Several GETs answered together: `data` stays undefined until every one has come back, so a
 * block built from them appears whole instead of piece by piece. A request that fails is `null`
 * in its place. `null` skips them all. Refetched when the list or the session changes.
 */
export function useApiAll<T>(requests: { path: string; opts?: RequestOptions }[] | null): (T | null)[] | undefined {
  const { sessionKey, loading: authLoading } = useAuth();
  const [result, setResult] = useState<AllResult<T>>({ key: null, data: undefined });
  const listKey = requests === null ? null : JSON.stringify(requests);
  const key = listKey === null ? null : JSON.stringify([listKey, sessionKey]);

  useEffect(() => {
    if (key === null || listKey === null || authLoading) return;
    let cancelled = false;
    const list = JSON.parse(listKey) as { path: string; opts?: RequestOptions }[];
    void Promise.all(list.map((r) => api<T>(r.path, r.opts).catch(() => null))).then((data) => {
      if (!cancelled) setResult({ key, data });
    });
    return () => {
      cancelled = true;
    };
  }, [key, listKey, authLoading]);

  return result.key === key ? result.data : undefined;
}
