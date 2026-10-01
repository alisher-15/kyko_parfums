"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ErrorBox, Spinner, SuccessBox } from "@/components/ui";
import { api } from "@/lib/api";
import { money, plural } from "@/lib/format";
import type { BrandGroup, Markups, PriceGroup, RepriceReport } from "@/lib/types";
import { useApi } from "@/lib/use-api";

type Level = "retail" | "wholesale" | "bulk";

const LEVELS: { key: Level; label: string }[] = [
  { key: "retail", label: "Розница" },
  { key: "wholesale", label: "Опт" },
  { key: "bulk", label: "Крупный опт" },
];

// How long to wait after the last keystroke before asking what would change.
const CHECK_DELAY = 350;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const percent = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1, signDisplay: "exceptZero" });
const volumes = (n: number) => `${n} ${plural(n, "объёма", "объёмов", "объёмов")}`;
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const groupLabel = (g: PriceGroup) => `${g.name} · ${g.retail} / ${g.wholesale} / ${g.bulk}%`;

/** "Изменятся цены у 380 объёмов (дороже 375, дешевле 5), в среднем +4,2%". */
function impactText(r: RepriceReport): string {
  if (r.changed === 0) return "Цены не изменятся";
  const sides = [r.raised && `дороже ${r.raised}`, r.lowered && `дешевле ${r.lowered}`].filter(Boolean);
  let text = `Изменятся цены у ${volumes(r.changed)}`;
  if (sides.length) text += ` (${sides.join(", ")})`;
  if (r.avg_change !== null) text += `, в среднем ${percent.format(r.avg_change)}%`;
  if (r.locked) text += `. «Цена вручную» не меняется у ${volumes(r.locked)}`;
  return text;
}

/**
 * A what-if asked while the admin types: the latest request wins, older answers are dropped.
 * `ask(null)` cancels.
 */
function useCheck() {
  const [report, setReport] = useState<RepriceReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seq = useRef(0);

  const ask = (request: (() => Promise<RepriceReport>) | null) => {
    clearTimeout(timer.current);
    const id = ++seq.current;
    setReport(null);
    setError(null);
    setChecking(request !== null);
    if (!request) return;
    timer.current = setTimeout(async () => {
      try {
        const r = await request();
        if (id === seq.current) setReport(r);
      } catch (err) {
        if (id === seq.current) setError(errorText(err));
      } finally {
        if (id === seq.current) setChecking(false);
      }
    }, CHECK_DELAY);
  };
  return { report, checking, error, ask };
}

export default function MarkupsPage() {
  const { data, error, reload } = useApi<Markups>("/admin/markups");
  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  if (!data) return <Spinner />;
  return (
    <div className="max-w-5xl space-y-6">
      <AdminHeader title="Наценки" />
      <p className="text-sm text-muted">
        Цена = себестоимость × (1 + наценка группы бренда), с округлением вверх до 100{" "}₸:
        себестоимость 10{" "}000{" "}₸ с наценкой 30% даёт 13{" "}000{" "}₸. Бренд
        без группы считается в группе по умолчанию. «Сохранить» сразу меняет цены на сайте, а до
        этого видно, сколько цен изменится. Объёмы с отметкой «Цена вручную» и без себестоимости не
        меняются.
      </p>
      <GroupsCard groups={data.groups} onSaved={reload} />
      <BrandsCard groups={data.groups} brands={data.brands} onSaved={reload} />
      <RecalcCard groups={data.groups} />
    </div>
  );
}

// ---------- Groups ----------

type GroupForm = { name: string } & Record<Level, string>;

const toForm = (g: PriceGroup): GroupForm => ({
  name: g.name,
  retail: String(g.retail),
  wholesale: String(g.wholesale),
  bulk: String(g.bulk),
});

const toBody = (f: GroupForm) => ({
  name: f.name.trim(),
  retail: Number(f.retail),
  wholesale: Number(f.wholesale),
  bulk: Number(f.bulk),
});

const complete = (f: GroupForm) => Boolean(f.name.trim()) && LEVELS.every(({ key }) => f[key] !== "");

// Phones: a card per group. Wider screens: a row per group under a header.
const GROUP_GRID =
  "sm:grid sm:grid-cols-[minmax(9rem,1fr)_repeat(3,6.5rem)_4.5rem_2.5rem] sm:items-center sm:gap-3";

function GroupsCard({ groups, onSaved }: { groups: PriceGroup[]; onSaved: () => void }) {
  const [notice, setNotice] = useState<string | null>(null);
  const saved = (text: string) => {
    setNotice(text);
    onSaved();
  };
  return (
    <div className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold">Группы наценок</h2>
        <p className="text-sm text-muted">
          Наценка на себестоимость для каждого уровня цен. Поменяйте проценты, и под строкой будет
          видно, сколько цен изменится.
        </p>
      </div>
      {notice && <SuccessBox>{notice}</SuccessBox>}
      <div>
        <div
          className={`hidden border-b border-line pb-2 text-xs font-semibold tracking-wide text-muted uppercase ${GROUP_GRID}`}
        >
          <span>Группа</span>
          {LEVELS.map(({ key, label }) => (
            <span key={key}>{label}</span>
          ))}
          <span className="text-center">Брендов</span>
          <span></span>
        </div>
        <div className="divide-y divide-line">
          {groups.map((g) => (
            <GroupRow
              key={`${g.id}:${g.name}:${g.retail}:${g.wholesale}:${g.bulk}`}
              group={g}
              onSaved={saved}
            />
          ))}
          <NewGroupRow key={groups.length} template={groups[0]} onSaved={saved} />
        </div>
      </div>
    </div>
  );
}

function PercentInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        className="input w-full text-right"
        inputMode="numeric"
        aria-label={`${label}, %`}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      />
      <span className="text-muted">%</span>
    </div>
  );
}

/** The three percent fields of a group, each with its own caption on phones. */
function LevelInputs({
  name,
  form,
  onChange,
}: {
  name: string;
  form: GroupForm;
  onChange: (key: Level, value: string) => void;
}) {
  return (
    <>
      {LEVELS.map(({ key, label }) => (
        <div key={key}>
          <span className="mb-1 block text-[11px] font-semibold tracking-wide text-muted uppercase sm:hidden">
            {label}
          </span>
          <PercentInput label={`${name}: ${label}`} value={form[key]} onChange={(v) => onChange(key, v)} />
        </div>
      ))}
    </>
  );
}

function GroupRow({ group, onSaved }: { group: PriceGroup; onSaved: (text: string) => void }) {
  const [form, setForm] = useState<GroupForm>(() => toForm(group));
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const check = useCheck();
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(group));
  const markupsChanged = LEVELS.some(({ key }) => form[key] !== String(group[key]));
  const error = saveError ?? check.error;

  const change = (patch: Partial<GroupForm>) => {
    const next = { ...form, ...patch };
    setForm(next);
    setSaveError(null);
    if (!("name" in patch)) {
      const ready = complete(next) && LEVELS.some(({ key }) => next[key] !== String(group[key]));
      check.ask(
        ready
          ? () =>
              api<RepriceReport>(`/admin/markups/groups/${group.id}`, {
                method: "PUT",
                query: { dry_run: true },
                body: toBody(next),
              })
          : null,
      );
    }
  };

  const save = async () => {
    setBusy(true);
    setSaveError(null);
    try {
      const r = await api<RepriceReport>(`/admin/markups/groups/${group.id}`, {
        method: "PUT",
        query: { dry_run: false },
        body: toBody(form),
      });
      const prices = r.changed ? `: обновлены цены у ${volumes(r.changed)}` : "";
      onSaved(`Группа «${form.name.trim()}» сохранена${prices}.`);
    } catch (err) {
      setSaveError(errorText(err));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Удалить группу «${group.name}»?`)) return;
    try {
      await api(`/admin/markups/groups/${group.id}`, { method: "DELETE" });
      onSaved(`Группа «${group.name}» удалена.`);
    } catch (err) {
      setSaveError(errorText(err));
    }
  };

  const reset = () => {
    setForm(toForm(group));
    setSaveError(null);
    setDetails(false);
    check.ask(null);
  };

  let status = "";
  if (error) status = error;
  else if (!markupsChanged) status = "Цены не изменятся";
  else if (check.checking) status = "Считаю, какие цены изменятся…";
  else if (check.report) status = impactText(check.report);

  return (
    <div className={`py-3 ${dirty ? "-mx-3 rounded-xl bg-cream/60 px-3" : ""}`}>
      <div className={`grid grid-cols-3 gap-2 ${GROUP_GRID}`}>
        <div className="col-span-3 sm:col-span-1">
          <input
            className="input"
            aria-label={`Название группы ${group.name}`}
            value={form.name}
            onChange={(e) => change({ name: e.target.value })}
          />
          {group.is_default && <div className="mt-1 text-xs text-muted">по умолчанию</div>}
        </div>
        <LevelInputs name={group.name} form={form} onChange={(key, value) => change({ [key]: value })} />
        <div className="col-span-2 self-center text-sm text-muted sm:col-span-1 sm:text-center sm:text-base sm:text-ink">
          <span className="sm:hidden">Брендов: </span>
          {group.brand_count}
        </div>
        <div className="text-right">
          {!group.is_default && group.brand_count === 0 && (
            <button type="button" className="btn btn-danger btn-sm" title="Удалить группу" onClick={remove}>
              ✕
            </button>
          )}
        </div>
      </div>
      {(dirty || saveError) && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className={error ? "text-red-700" : ""}>{status}</span>
            {!error && check.report && check.report.changed > 0 && (
              <button type="button" className="text-muted underline" onClick={() => setDetails(!details)}>
                {details ? "Скрыть" : "Что изменится"}
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={reset}>
                Отмена
              </button>
              <button
                type="button"
                className="btn btn-gold btn-sm"
                disabled={busy || !dirty || check.checking || Boolean(check.error) || !complete(form)}
                onClick={save}
              >
                Сохранить
              </button>
            </div>
          </div>
          {details && check.report && <ChangesTable report={check.report} limit={20} />}
        </div>
      )}
    </div>
  );
}

function NewGroupRow({ template, onSaved }: { template: PriceGroup | undefined; onSaved: (text: string) => void }) {
  const [form, setForm] = useState<GroupForm>(() => ({
    name: "",
    retail: String(template?.retail ?? ""),
    wholesale: String(template?.wholesale ?? ""),
    bulk: String(template?.bulk ?? ""),
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/admin/markups/groups", { body: toBody(form) });
      onSaved(`Группа «${form.name.trim()}» добавлена. Перенесите в неё бренды ниже.`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <div className="py-3">
      <div className={`grid grid-cols-3 gap-2 ${GROUP_GRID}`}>
        <div className="col-span-3 sm:col-span-1">
          <input
            className="input"
            placeholder="Новая группа"
            aria-label="Название новой группы"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <LevelInputs name="Новая группа" form={form} onChange={(key, value) => setForm({ ...form, [key]: value })} />
        <div className="col-span-3 text-right sm:col-span-2">
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || !complete(form)} onClick={add}>
            Добавить
          </button>
        </div>
      </div>
      {error && <div className="mt-2 text-sm text-red-700">{error}</div>}
    </div>
  );
}

// ---------- Brands ----------

// Phones: checkbox and name, the group under the name. Wider screens: a row with the product count.
const BRAND_GRID =
  "grid grid-cols-[1.25rem_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[1.25rem_1fr_5rem_17rem]";

function BrandsCard({
  groups,
  brands,
  onSaved,
}: {
  groups: PriceGroup[];
  brands: BrandGroup[];
  onSaved: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [checked, setChecked] = useState<number[]>([]);
  // Brand id -> the group it is going to, not saved yet.
  const [moves, setMoves] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const check = useCheck();

  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const needle = query.trim().toLowerCase();
  const shown = brands.filter(
    (b) => b.name.toLowerCase().includes(needle) && (!filter || String(b.group_id) === filter),
  );
  const moved = Object.keys(moves).length;
  const allShownChecked = shown.length > 0 && shown.every((b) => checked.includes(b.id));
  const error = saveError ?? check.error;

  const stage = (next: Record<number, number>) => {
    setMoves(next);
    setNotice(null);
    setSaveError(null);
    const list = Object.entries(next).map(([id, group]) => ({ brand_id: Number(id), group_id: group }));
    check.ask(
      list.length
        ? () =>
            api<RepriceReport>("/admin/markups/assign", {
              method: "POST",
              query: { dry_run: true },
              body: { brands: list },
            })
        : null,
    );
  };

  const moveTo = (ids: number[], groupId: number) => {
    const next = { ...moves };
    for (const brand of brands.filter((b) => ids.includes(b.id))) {
      if (brand.group_id === groupId) delete next[brand.id];
      else next[brand.id] = groupId;
    }
    stage(next);
  };

  const cancel = () => {
    stage({});
    setDetails(false);
  };

  const save = async () => {
    setBusy(true);
    setSaveError(null);
    try {
      const list = Object.entries(moves).map(([id, group]) => ({ brand_id: Number(id), group_id: group }));
      const r = await api<RepriceReport>("/admin/markups/assign", {
        method: "POST",
        query: { dry_run: false },
        body: { brands: list },
      });
      setMoves({});
      setChecked([]);
      setDetails(false);
      check.ask(null);
      const prices = r.changed ? `: обновлены цены у ${volumes(r.changed)}` : "";
      setNotice(`Перенесено ${moved} ${plural(moved, "бренд", "бренда", "брендов")}${prices}.`);
      onSaved();
    } catch (err) {
      setSaveError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  let status = "";
  if (error) status = error;
  else if (check.checking) status = "считаю, какие цены изменятся…";
  else if (check.report) status = lowerFirst(impactText(check.report));

  return (
    <div className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold">Бренды по группам</h2>
        <p className="text-sm text-muted">
          Выберите группу в строке бренда или отметьте несколько брендов и перенесите их разом. Цены
          изменятся после «Сохранить».
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input max-w-xs"
          placeholder="Найти бренд"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="input w-auto max-w-full"
          aria-label="Показать группу"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">Все группы ({brands.length})</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.brand_count})
            </option>
          ))}
        </select>
      </div>
      {checked.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-cream/60 p-2 text-sm">
          <span>
            Отмечено: <b>{checked.length}</b>
          </span>
          <select
            className="input w-auto max-w-full"
            aria-label="Перенести отмеченные в группу"
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              moveTo(checked, Number(e.target.value));
              setChecked([]);
            }}
          >
            <option value="">Перенести в группу…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {groupLabel(g)}
              </option>
            ))}
          </select>
          <button type="button" className="text-muted underline" onClick={() => setChecked([])}>
            Снять отметки
          </button>
        </div>
      )}
      <div>
        <div
          className={`${BRAND_GRID} border-b border-line pb-2 text-xs font-semibold tracking-wide text-muted uppercase`}
        >
          <input
            type="checkbox"
            className="accent-gold"
            aria-label="Отметить все"
            checked={allShownChecked}
            onChange={(e) =>
              setChecked(
                e.target.checked
                  ? [...new Set([...checked, ...shown.map((b) => b.id)])]
                  : checked.filter((id) => !shown.some((b) => b.id === id)),
              )
            }
          />
          <span>Бренд</span>
          <span className="hidden sm:block">Товаров</span>
          <span className="hidden sm:block">Группа</span>
        </div>
        <div className="divide-y divide-line">
          {shown.map((b) => {
            const target = moves[b.id];
            return (
              <div
                key={b.id}
                className={`${BRAND_GRID} py-2 ${target !== undefined ? "-mx-3 rounded-lg bg-cream/60 px-3" : ""}`}
              >
                <input
                  type="checkbox"
                  className="accent-gold"
                  aria-label={`Отметить ${b.name}`}
                  checked={checked.includes(b.id)}
                  onChange={(e) =>
                    setChecked(e.target.checked ? [...checked, b.id] : checked.filter((id) => id !== b.id))
                  }
                />
                <div className="min-w-0">
                  <Link href={`/admin/products?brand_id=${b.id}`} className="hover:text-gold">
                    {b.name}
                  </Link>
                  <span className="ml-1 text-xs text-muted sm:hidden">· {b.product_count}</span>
                </div>
                <span className="hidden text-muted sm:block">{b.product_count}</span>
                <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-2 sm:col-start-auto">
                  <select
                    className="input w-auto max-w-full"
                    aria-label={`Группа бренда ${b.name}`}
                    value={target ?? b.group_id}
                    onChange={(e) => moveTo([b.id], Number(e.target.value))}
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {groupLabel(g)}
                      </option>
                    ))}
                  </select>
                  {target !== undefined && (
                    <span className="text-xs text-muted">было: {groupName.get(b.group_id)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {shown.length === 0 && <p className="py-4 text-sm text-muted">Брендов не найдено.</p>}
      </div>
      {moved > 0 && (
        <div className="sticky bottom-3 z-10 space-y-2 rounded-xl border border-gold bg-white p-3 shadow-lg">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              <b>
                Перенос {moved} {plural(moved, "бренда", "брендов", "брендов")}
              </b>
              {status && ": "}
              <span className={error ? "text-red-700" : ""}>{status}</span>
            </span>
            {!error && check.report && check.report.changed > 0 && (
              <button type="button" className="text-muted underline" onClick={() => setDetails(!details)}>
                {details ? "Скрыть" : "Что изменится"}
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={cancel}>
                Отменить
              </button>
              <button
                type="button"
                className="btn btn-gold btn-sm"
                disabled={busy || check.checking || Boolean(check.error)}
                onClick={save}
              >
                Сохранить
              </button>
            </div>
          </div>
          {details && check.report && (
            <div className="max-h-80 overflow-y-auto">
              <ChangesTable report={check.report} limit={20} />
            </div>
          )}
        </div>
      )}
      {notice && moved === 0 && (
        <div className="sticky bottom-3 z-10">
          <SuccessBox>{notice}</SuccessBox>
        </div>
      )}
    </div>
  );
}

// ---------- Recalculation after the cost changed ----------

function RecalcCard({ groups }: { groups: PriceGroup[] }) {
  const [groupId, setGroupId] = useState("");
  const [report, setReport] = useState<RepriceReport | null>(null);
  const [applied, setApplied] = useState<RepriceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<RepriceReport>("/admin/markups/recalculate", {
        method: "POST",
        query: { dry_run: dryRun, group_id: groupId || undefined },
      });
      setReport(dryRun ? r : null);
      setApplied(dryRun ? null : r);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold">Пересчитать по себестоимости</h2>
        <p className="text-sm text-muted">
          Когда себестоимость обновилась (импорт, приёмка), цены можно посчитать заново по наценкам
          групп. Сначала проверьте, что изменится, потом примените.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          className="input w-auto max-w-full"
          aria-label="Какие бренды"
          value={groupId}
          onChange={(e) => {
            setGroupId(e.target.value);
            setReport(null);
            setApplied(null);
          }}
        >
          <option value="">Все группы</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => run(true)}>
          Проверить
        </button>
        {report && report.changed > 0 && (
          <button
            type="button"
            className="btn btn-gold"
            disabled={busy}
            onClick={() => confirm(`Изменить цены у ${volumes(report.changed)}?`) && run(false)}
          >
            Применить
          </button>
        )}
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {applied && <SuccessBox>Цены обновлены у {volumes(applied.changed)}.</SuccessBox>}
      {report && (
        <div className="space-y-3">
          <div className="rounded-lg bg-cream/60 p-3 text-sm">
            {impactText(report)}. Уже по наценке: {report.unchanged}, без себестоимости: {report.no_cost}.
          </div>
          {report.changed > 0 && <ChangesTable report={report} />}
        </div>
      )}
    </div>
  );
}

// ---------- Changes ----------

function ChangesTable({ report, limit }: { report: RepriceReport; limit?: number }) {
  const lines = limit ? report.lines.slice(0, limit) : report.lines;
  return (
    <div className="mt-2 space-y-2">
      {lines.length < report.changed && (
        <div className="text-xs text-muted">Самые большие изменения розничной цены: {lines.length} из {report.changed}.</div>
      )}
      <div className="overflow-x-auto">
        <table className="table-base bg-white">
          <thead>
            <tr>
              <th>Товар</th>
              <th>Себестоимость</th>
              {LEVELS.map(({ key, label }) => (
                <th key={key}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.variant_id}>
                <td>
                  <Link href={`/admin/products/${l.product_id}`} className="hover:text-gold">
                    {l.label}
                  </Link>
                </td>
                <td className="whitespace-nowrap">{money(l.cost_price)}</td>
                <PriceChange from={l.old_retail} to={l.retail} />
                <PriceChange from={l.old_wholesale} to={l.wholesale} />
                <PriceChange from={l.old_bulk} to={l.bulk} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PriceChange({ from, to }: { from: number | null; to: number }) {
  if (from === to) return <td className="whitespace-nowrap text-muted">{money(to)}</td>;
  return (
    <td className="whitespace-nowrap">
      <span className="text-muted">{money(from)} → </span>
      <b className={from !== null && to < from ? "text-emerald-700" : ""}>{money(to)}</b>
    </td>
  );
}
