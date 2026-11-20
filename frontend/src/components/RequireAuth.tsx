"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import type { UserRole } from "@/lib/types";
import { Spinner } from "./ui";

/** Client-side guard. The API enforces access on its own; this only handles redirects. */
/** `roles`: who may see the page; any signed-in user when left out. */
export function RequireAuth({ children, roles }: { children: ReactNode; roles?: UserRole[] }) {
  const { user, loading, takeLogoutTarget } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(takeLogoutTarget() ?? `/login?next=${encodeURIComponent(pathname)}`);
    else if (roles && !roles.includes(user.role)) router.replace("/");
  }, [loading, user, roles, router, pathname, takeLogoutTarget]);

  if (loading || !user || (roles && !roles.includes(user.role))) return <Spinner />;
  return <>{children}</>;
}
