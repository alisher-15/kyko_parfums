"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import type { UserRole } from "@/lib/types";
import { Spinner } from "./ui";

/** Client-side guard. The API enforces access on its own; this only handles redirects. */
export function RequireAuth({ children, role }: { children: ReactNode; role?: UserRole }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (role && user.role !== role) router.replace("/");
  }, [loading, user, role, router, pathname]);

  if (loading || !user || (role && user.role !== role)) return <Spinner />;
  return <>{children}</>;
}
