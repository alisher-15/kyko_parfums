"use client";

import { useState, type FormEvent } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ErrorBox, Field, Pagination, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS, dateTime } from "@/lib/format";
import type { AdminUser, Page, UserRole } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const PAGE_SIZE = 50;
const ROLES = Object.keys(ROLE_LABELS) as UserRole[];

export function UsersAdmin({
  initialRole,
  initialRequests,
  initialQuery,
}: {
  initialRole: UserRole | "";
  initialRequests: boolean;
  initialQuery: string;
}) {
  const { user: me } = useAuth();
  const [q, setQ] = useState(initialQuery);
  const [search, setSearch] = useState(initialQuery);
  const [role, setRole] = useState<UserRole | "">(initialRole);
  const [requests, setRequests] = useState(initialRequests);
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data, error, loading, reload } = useApi<Page<AdminUser>>("/admin/users", {
    query: {
      q: search,
      role,
      wholesale_requested: requests || undefined,
      page,
      page_size: PAGE_SIZE,
    },
  });

  const patch = async (u: AdminUser, body: Record<string, unknown>) => {
    setMsg(null);
    try {
      await api(`/admin/users/${u.id}`, { method: "PATCH", body });
      reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <AdminHeader
        title={`Пользователи${data ? ` · ${data.total}` : ""}`}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? "Скрыть форму" : "+ Добавить пользователя"}
          </button>
        }
      />
      {showCreate && (
        <CreateUser
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q);
            setPage(1);
          }}
          className="flex flex-1 gap-2"
        >
          <input
            className="input min-w-48"
            placeholder="Email, имя, телефон, компания"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn btn-outline btn-sm">Найти</button>
        </form>
        <select
          className="input w-auto"
          value={role}
          onChange={(e) => {
            setRole(e.target.value as UserRole | "");
            setPage(1);
          }}
        >
          <option value="">Все роли</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-gold"
            checked={requests}
            onChange={(e) => {
              setRequests(e.target.checked);
              setPage(1);
            }}
          />
          Только заявки на опт
        </label>
      </div>
      {(msg || error) && (
        <div className="mb-4">
          <ErrorBox>{msg ?? error?.message}</ErrorBox>
        </div>
      )}
      {loading && !data && <Spinner />}
      {data && (
        <div className={`card overflow-x-auto ${loading ? "opacity-60" : ""}`}>
          <table className="table-base">
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Компания / телефон</th>
                <th>Роль</th>
                <th>Заказов</th>
                <th>Регистрация</th>
                <th>Доступ</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id} className={u.wholesale_requested ? "bg-amber-50" : ""}>
                  <td>
                    <div className="font-semibold">{u.email}</div>
                    <div className="text-xs text-muted">{u.full_name}</div>
                    {u.wholesale_requested && (
                      <span className="mt-1 inline-block rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-white">
                        ЗАЯВКА НА ОПТ
                      </span>
                    )}
                  </td>
                  <td className="text-xs">
                    <div>{u.company_name}</div>
                    <div className="text-muted">{u.phone}</div>
                  </td>
                  <td>
                    <select
                      className="input w-auto py-1"
                      value={u.role}
                      disabled={u.id === me?.id}
                      onChange={(e) => patch(u, { role: e.target.value })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    {u.wholesale_requested && u.role === "retail" && (
                      <button
                        className="mt-1 block text-[11px] text-muted underline"
                        onClick={() => patch(u, { wholesale_requested: false })}
                      >
                        отклонить заявку
                      </button>
                    )}
                  </td>
                  <td>{u.orders_count}</td>
                  <td className="text-xs">{dateTime(u.created_at)}</td>
                  <td>
                    <button
                      className={`btn btn-sm ${u.is_active ? "btn-outline" : "btn-danger"}`}
                      disabled={u.id === me?.id}
                      onClick={() => patch(u, { is_active: !u.is_active })}
                    >
                      {u.is_active ? "Активен" : "Заблокирован"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} onChange={setPage} />}
    </>
  );
}

function CreateUser({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    email: "",
    password: "",
    role: "wholesale" as UserRole,
    full_name: "",
    phone: "",
    company_name: "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api("/admin/users", {
        body: {
          ...form,
          full_name: form.full_name || null,
          phone: form.phone || null,
          company_name: form.company_name || null,
        },
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form onSubmit={submit} className="card mb-4 grid gap-4 p-4 sm:grid-cols-3">
      <Field label="Email">
        <input className="input" type="email" required value={form.email} onChange={set("email")} />
      </Field>
      <Field label="Пароль" hint="Минимум 8 символов">
        <input className="input" required minLength={8} value={form.password} onChange={set("password")} />
      </Field>
      <Field label="Роль">
        <select className="input" value={form.role} onChange={set("role")}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Имя">
        <input className="input" value={form.full_name} onChange={set("full_name")} />
      </Field>
      <Field label="Телефон">
        <input className="input" value={form.phone} onChange={set("phone")} />
      </Field>
      <Field label="Компания">
        <input className="input" value={form.company_name} onChange={set("company_name")} />
      </Field>
      {error && (
        <div className="sm:col-span-3">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
      <div className="sm:col-span-3">
        <button className="btn btn-primary btn-sm">Создать</button>
      </div>
    </form>
  );
}
