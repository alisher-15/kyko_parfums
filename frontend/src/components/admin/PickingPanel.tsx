"use client";

import { useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";
import type { AdminOrder, OrderItem, VariantSearchItem } from "@/lib/types";
import { ScanField, type ScanResult } from "./ScanField";

type Picked = Record<number, number>; // order item id -> units scanned

function storageKey(orderId: number) {
  return `kyko.picking.${orderId}`;
}

function loadPicked(orderId: number): Picked {
  try {
    return JSON.parse(window.sessionStorage.getItem(storageKey(orderId)) ?? "{}") as Picked;
  } catch {
    return {};
  }
}

function savePicked(orderId: number, picked: Picked) {
  try {
    window.sessionStorage.setItem(storageKey(orderId), JSON.stringify(picked));
  } catch {
    // storage unavailable — progress lives only on this page
  }
}

function label(i: OrderItem) {
  return `${i.brand_name} ${i.product_name}, ${i.volume_ml} мл`;
}

/**
 * Picking an online order with the scanner: every scanned unit is checked against the order, so
 * the wrong volume or an extra unit is caught before the parcel leaves. The stock was already
 * taken at checkout, so picking does not change it. Progress survives a page reload in this tab.
 */
export function PickingPanel({
  order,
  canShip,
  onShip,
  onClose,
}: {
  order: AdminOrder;
  canShip: boolean;
  onShip: () => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Picked>(() => loadPicked(order.id));
  // Scans can arrive faster than re-renders; the ref always holds the latest counts.
  const pickedRef = useRef(picked);
  const lines = order.items.filter((i) => i.quantity > 0);
  const done = lines.every((i) => (picked[i.id] ?? 0) >= i.quantity);
  const totalNeeded = lines.reduce((s, i) => s + i.quantity, 0);
  const totalPicked = lines.reduce((s, i) => s + Math.min(picked[i.id] ?? 0, i.quantity), 0);

  const update = (next: Picked) => {
    pickedRef.current = next;
    savePicked(order.id, next);
    setPicked(next);
  };
  const change = (itemId: number, delta: number) => {
    const prev = pickedRef.current;
    update({ ...prev, [itemId]: Math.max(0, (prev[itemId] ?? 0) + delta) });
  };

  const scan = async (code: string): Promise<ScanResult> => {
    let found: VariantSearchItem;
    try {
      found = await api<VariantSearchItem>(`/admin/barcodes/${encodeURIComponent(code)}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        return { ok: false, text: `Штрихкод ${code} не найден в каталоге` };
      }
      throw e;
    }
    const name = `${found.brand_name} ${found.product_name}, ${found.volume_ml} мл`;
    const line = lines.find((i) => i.variant_id === found.variant_id);
    if (!line) {
      const sameProduct = lines.find((i) => i.product_id === found.product_id);
      return {
        ok: false,
        text: sameProduct
          ? `Не тот объём: ${found.volume_ml} мл, в заказе ${sameProduct.volume_ml} мл`
          : `Этого товара нет в заказе: ${name}`,
      };
    }
    const have = pickedRef.current[line.id] ?? 0;
    if (have >= line.quantity) {
      return { ok: false, text: `Лишняя штука: ${name} — нужно ${line.quantity}, уже собрано` };
    }
    change(line.id, 1);
    return { ok: true, text: `${name} — ${have + 1} из ${line.quantity}` };
  };

  return (
    <div className="card space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-2xl font-semibold">
          Сборка заказа · {totalPicked} из {totalNeeded} шт.
        </h2>
        <div className="flex gap-3 text-sm">
          <button
            className="text-muted hover:text-ink"
            onClick={() => update({})}
          >
            Начать заново
          </button>
          <button className="text-muted hover:text-ink" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
      <ScanField onScan={scan} placeholder="Сканируйте товары заказа" />
      <ul className="divide-y divide-line">
        {lines.map((i) => {
          const have = picked[i.id] ?? 0;
          const full = have >= i.quantity;
          return (
            <li key={i.id} className="flex flex-wrap items-center gap-3 py-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  full ? "bg-emerald-600 text-white" : "border border-line text-muted"
                }`}
                aria-hidden
              >
                {full ? "✓" : ""}
              </span>
              <span className="min-w-0 flex-1 basis-48 text-sm font-semibold">{label(i)}</span>
              <span className="flex items-center gap-2 text-sm tabular-nums">
                <button
                  className="btn btn-outline btn-sm px-2"
                  disabled={have === 0}
                  onClick={() => change(i.id, -1)}
                  aria-label="Убрать одну"
                >
                  −
                </button>
                <span className={full ? "text-emerald-700" : ""}>
                  {have} из {i.quantity}
                </span>
                <button
                  className="btn btn-outline btn-sm px-2"
                  disabled={full}
                  onClick={() => change(i.id, 1)}
                  aria-label="Добавить без сканера"
                >
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {done && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          <span className="flex-1 font-semibold">Заказ собран полностью.</span>
          {canShip && (
            <button className="btn btn-primary btn-sm" onClick={onShip}>
              Отметить «Отправлен»
            </button>
          )}
        </div>
      )}
    </div>
  );
}
