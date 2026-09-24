"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorBox, Spinner } from "@/components/ui";
import type { Brand } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export function BrandsView() {
  const { data, error } = useApi<Brand[]>("/brands");
  const [q, setQ] = useState("");

  const brands = (data ?? []).filter((b) => b.name.toLowerCase().includes(q.trim().toLowerCase()));
  const groups = new Map<string, Brand[]>();
  for (const b of brands) {
    const letter = b.name[0]?.toUpperCase() ?? "#";
    const key = /[A-ZА-ЯЁ]/.test(letter) ? letter : "#";
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-4xl font-bold">Бренды</h1>
        <input
          className="input max-w-xs rounded-full"
          placeholder="Найти бренд"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {error && <ErrorBox>{error.message}</ErrorBox>}
      {!data && !error && <Spinner />}
      <div className="columns-1 gap-8 sm:columns-2 lg:columns-4">
        {[...groups.entries()].map(([letter, list]) => (
          <div key={letter} className="mb-6 break-inside-avoid">
            <div className="mb-2 font-serif text-3xl font-bold text-gold">{letter}</div>
            <ul className="space-y-1 text-sm">
              {list.map((b) => (
                <li key={b.id}>
                  <Link href={`/catalog?brand_id=${b.id}`} className="hover:text-gold">
                    {b.name} <span className="text-muted">({b.product_count})</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
