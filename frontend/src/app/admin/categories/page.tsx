"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ErrorBox, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { KIND_LABELS, childrenOf, pathOf } from "@/lib/categories";
import { plural } from "@/lib/format";
import type { AdminCategory, CategoryKind } from "@/lib/types";
import { useApi } from "@/lib/use-api";

// Section → group → kind («Макияж» → «Губы» → «Помада»), as on the server.
const MAX_DEPTH = 3;
const KINDS = Object.keys(KIND_LABELS) as CategoryKind[];

type Run = (fn: () => Promise<unknown>) => Promise<boolean>;

/**
 * The catalog tree: the sections are the shop's menu, the groups its submenus. A section decides
 * which fields its products have (perfumes: concentration, notes, olfactory group).
 */
export default function AdminCategoriesPage() {
  const { data, error, reload } = useApi<AdminCategory[]>("/admin/categories");
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryKind>("cosmetics");

  const run: Run = async (fn) => {
    setMsg(null);
    try {
      await fn();
      reload();
      return true;
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const createSection = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api("/admin/categories", { body: { name, kind } }))) setName("");
  };

  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  if (!data) return <Spinner />;

  return (
    <div className="max-w-4xl space-y-4">
      <AdminHeader title="Категории" />
      <p className="text-sm text-muted">
        Разделы — это меню сайта (Парфюмерия, Макияж, Уход…), группы внутри — подменю и
        подборки в каталоге. Раздел или группа без товаров на сайте не показываются. Тип раздела
        задаёт поля товара: у парфюмерии есть концентрация (EDP, EDT), ноты и олфактивная группа, у
        косметики их нет. Уровней не больше трёх: раздел → группа → вид (Макияж → Губы → Помада).
      </p>

      <form onSubmit={createSection} className="card flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-48 flex-1">
          <span className="label">Новый раздел</span>
          <input
            className="input"
            required
            maxLength={128}
            placeholder="Например, Для мужчин"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          <span className="label">Тип</span>
          <select
            className="input w-auto"
            value={kind}
            onChange={(e) => setKind(e.target.value as CategoryKind)}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary">Добавить раздел</button>
      </form>

      {msg && <ErrorBox>{msg}</ErrorBox>}

      <div className="space-y-3">
        {childrenOf(data, null).map((section) => (
          <div key={section.id} className="card p-2">
            <Node node={section} all={data} run={run} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Node({ node, all, run }: { node: AdminCategory; all: AdminCategory[]; run: Run }) {
  const [mode, setMode] = useState<"view" | "edit" | "add">("view");
  const depth = pathOf(all, node.id).length;
  const children = childrenOf(all, node.id);
  const siblings = childrenOf(all, node.parent_id);
  const index = siblings.findIndex((c) => c.id === node.id);
  const empty = children.length === 0 && node.product_count === 0;

  const move = (direction: "up" | "down") =>
    run(() =>
      api(`/admin/categories/${node.id}/move`, { body: {}, query: { direction } }),
    );
  const remove = () => {
    if (!confirm(`Удалить «${node.name}»?`)) return;
    void run(() => api(`/admin/categories/${node.id}`, { method: "DELETE" }));
  };

  return (
    <div>
      <div
        className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ${depth === 1 ? "bg-cream" : ""}`}
        style={{ marginLeft: (depth - 1) * 24 }}
      >
        <div className="min-w-40 flex-1">
          <span className={depth === 1 ? "font-serif text-lg font-semibold" : "font-medium"}>
            {node.name}
          </span>
          {depth === 1 && <span className="chip ml-2">{KIND_LABELS[node.kind]}</span>}
          <Link
            href={`/admin/products?category_id=${node.id}`}
            className="ml-2 text-xs text-muted hover:text-ink"
          >
            {node.product_count} {plural(node.product_count, "товар", "товара", "товаров")}
          </Link>
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={index <= 0}
            onClick={() => move("up")}
            aria-label={`${node.name}: выше`}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={index === siblings.length - 1}
            onClick={() => move("down")}
            aria-label={`${node.name}: ниже`}
          >
            ↓
          </button>
          {depth < MAX_DEPTH && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setMode("add")}>
              + {depth === 1 ? "Группа" : "Вид"}
            </button>
          )}
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setMode("edit")}>
            Изменить
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={!empty}
            title={empty ? undefined : "Сначала перенесите товары и удалите группы внутри"}
            onClick={remove}
          >
            Удалить
          </button>
        </div>
      </div>

      {mode === "add" && (
        <AddChild parent={node} run={run} onDone={() => setMode("view")} depth={depth} />
      )}
      {mode === "edit" && (
        <EditNode node={node} all={all} run={run} onDone={() => setMode("view")} depth={depth} />
      )}

      {children.map((c) => (
        <Node key={c.id} node={c} all={all} run={run} />
      ))}
    </div>
  );
}

function AddChild({
  parent,
  depth,
  run,
  onDone,
}: {
  parent: AdminCategory;
  depth: number;
  run: Run;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(() =>
      api("/admin/categories", { body: { name, parent_id: parent.id } }),
    );
    if (ok) onDone();
  };
  return (
    <form
      onSubmit={submit}
      className="my-1 flex flex-wrap items-center gap-2 px-3"
      style={{ marginLeft: depth * 24 }}
    >
      <input
        className="input max-w-xs"
        required
        autoFocus
        maxLength={128}
        placeholder={`Новая группа в «${parent.name}»`}
        aria-label={`Новая группа в «${parent.name}»`}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button className="btn btn-primary btn-sm">Добавить</button>
      <button type="button" className="btn btn-outline btn-sm" onClick={onDone}>
        Отмена
      </button>
    </form>
  );
}

function EditNode({
  node,
  all,
  depth,
  run,
  onDone,
}: {
  node: AdminCategory;
  all: AdminCategory[];
  depth: number;
  run: Run;
  onDone: () => void;
}) {
  const [name, setName] = useState(node.name);
  const [parent, setParent] = useState(node.parent_id === null ? "" : String(node.parent_id));
  const [kind, setKind] = useState<CategoryKind>(node.kind);
  // Where it can go: not into itself or below itself (the server also checks the depth).
  const below = new Set<number>();
  const collect = (id: number) => {
    below.add(id);
    childrenOf(all, id).forEach((c) => collect(c.id));
  };
  collect(node.id);
  const targets = all.filter((c) => !below.has(c.id) && pathOf(all, c.id).length < MAX_DEPTH);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = { name };
    const parentId = parent === "" ? null : Number(parent);
    if (parentId !== node.parent_id) body.parent_id = parentId;
    if (parentId === null && kind !== node.kind) body.kind = kind;
    if (await run(() => api(`/admin/categories/${node.id}`, { method: "PATCH", body }))) onDone();
  };

  return (
    <form
      onSubmit={submit}
      className="my-1 flex flex-wrap items-end gap-2 rounded-xl border border-line px-3 py-3"
      style={{ marginLeft: (depth - 1) * 24 }}
    >
      <label className="min-w-40 flex-1">
        <span className="label">Название</span>
        <input
          className="input"
          required
          maxLength={128}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        <span className="label">Где</span>
        <select className="input w-auto" value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">Отдельный раздел</option>
          {targets.map((c) => (
            <option key={c.id} value={c.id}>
              {"   ".repeat(pathOf(all, c.id).length - 1)}
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {parent === "" && (
        <label>
          <span className="label">Тип</span>
          <select
            className="input w-auto"
            value={kind}
            onChange={(e) => setKind(e.target.value as CategoryKind)}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      )}
      <button className="btn btn-primary btn-sm">Сохранить</button>
      <button type="button" className="btn btn-outline btn-sm" onClick={onDone}>
        Отмена
      </button>
    </form>
  );
}
