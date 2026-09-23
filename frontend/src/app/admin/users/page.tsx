import type { UserRole } from "@/lib/types";
import { UsersAdmin } from "./users-admin";

export default async function AdminUsersPage(props: PageProps<"/admin/users">) {
  const sp = await props.searchParams;
  return (
    <UsersAdmin
      initialRole={typeof sp.role === "string" ? (sp.role as UserRole) : ""}
      initialRequests={sp.wholesale_requested === "true"}
      initialQuery={typeof sp.q === "string" ? sp.q : ""}
    />
  );
}
