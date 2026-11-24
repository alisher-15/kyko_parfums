"use client";

import type { Category, CategoryKind } from "./types";
import { useApi } from "./use-api";

// The catalog tree: sections («Парфюмерия», «Наборы», «Макияж», …) and their groups («Губы»). The
// API sends the nodes in tree order: each section followed by its groups, depth first.

export const KIND_LABELS: Record<CategoryKind, string> = {
  perfume: "Парфюмерия",
  cosmetics: "Косметика",
};

/** The shop's tree: only the nodes with active products. */
export function useCategories(): Category[] | undefined {
  return useApi<Category[]>("/categories").data;
}

export function childrenOf<T extends Pick<Category, "id" | "parent_id">>(
  all: T[],
  parentId: number | null,
): T[] {
  return all.filter((c) => c.parent_id === parentId);
}

/** From the section down to this node. */
export function pathOf<T extends Pick<Category, "id" | "parent_id">>(all: T[], id: number): T[] {
  const byId = new Map(all.map((c) => [c.id, c]));
  const path: T[] = [];
  for (
    let node = byId.get(id);
    node;
    node = node.parent_id === null ? undefined : byId.get(node.parent_id)
  ) {
    path.unshift(node);
  }
  return path;
}

/** «Макияж / Губы». */
export function fullName(all: Pick<Category, "id" | "parent_id" | "name">[], id: number): string {
  return pathOf(all, id)
    .map((c) => c.name)
    .join(" / ");
}

/** For a <select>: every node, indented by its depth, in tree order. */
export function categoryOptions(
  all: Pick<Category, "id" | "parent_id" | "name">[],
): { id: number; label: string; depth: number }[] {
  return all.map((c) => {
    const depth = pathOf(all, c.id).length - 1;
    return { id: c.id, label: `${"   ".repeat(depth)}${c.name}`, depth };
  });
}

/**
 * Where a node leads, step by step as on Kaspi: to its groups (`/categories?parent=`) while it has
 * any, else to its products in the catalog.
 */
export function categoryHref(all: Pick<Category, "id" | "parent_id">[], node: Pick<Category, "id">): string {
  return childrenOf(all, node.id).length
    ? `/categories?parent=${node.id}`
    : `/catalog?category_id=${node.id}`;
}
