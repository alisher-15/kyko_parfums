"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { ErrorBox, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { Brand } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export default function AdminBrandsPage() {
  const { data, error, reload } = useApi<Brand[]>("/admin/brands");
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await api("/admin/brands", { body: { name } });
      setName("");
      reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const brands = (data ?? []).filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <AdminHeader title={`Бренды${data ? ` · ${data.length}` : ""}`} />
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <form onSubmit={create} className="flex flex-1 gap-2">
          <input
            className="input max-w-xs"
            placeholder="Новый бренд"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn btn-primary btn-sm">Добавить</button>
        </form>
        <input
          className="input max-w-xs"
          placeholder="Фильтр"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {(msg || error) && (
        <div className="mb-4">
          <ErrorBox>{msg ?? error?.message}</ErrorBox>
        </div>
      )}
      {!data && !error && <Spinner />}
      {data && (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Логотип</th>
                <th>Название</th>
                <th>Товаров</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <BrandRow key={b.id} brand={b} onChanged={reload} onError={setMsg} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function BrandRow({
  brand,
  onChanged,
  onError,
}: {
  brand: Brand;
  onChanged: () => void;
  onError: (msg: string | null) => void;
}) {
  const [name, setName] = useState(brand.name);
  const [logo, setLogo] = useState(brand.logo_url);
  const dirty = name !== brand.name || logo !== brand.logo_url;

  const run = async (fn: () => Promise<unknown>) => {
    onError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <tr>
      <td>
        <ImageUpload compact value={logo} onChange={setLogo} seed={brand.id} />
      </td>
      <td>
        <input className="input max-w-xs" value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      <td>
        <Link href={`/admin/products?brand_id=${brand.id}`} className="hover:text-gold">
          {brand.product_count}
        </Link>
      </td>
      <td className="whitespace-nowrap">
        <div className="flex gap-1">
          <button
            className="btn btn-primary btn-sm"
            disabled={!dirty}
            onClick={() =>
              run(() =>
                api(`/admin/brands/${brand.id}`, { method: "PATCH", body: { name, logo_url: logo } }),
              )
            }
          >
            Сохранить
          </button>
          <button
            className="btn btn-danger btn-sm"
            disabled={brand.product_count > 0}
            title={brand.product_count > 0 ? "Сначала удалите товары бренда" : "Удалить"}
            onClick={() =>
              confirm(`Удалить бренд «${brand.name}»?`) &&
              run(() => api(`/admin/brands/${brand.id}`, { method: "DELETE" }))
            }
          >
            ✕
          </button>
        </div>
      </td>
    </tr>
  );
}
