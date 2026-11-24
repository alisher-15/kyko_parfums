import { router } from "expo-router";
import { useApi } from "./queries";
import type { Category, CategoryKind } from "./types";

// The catalog tree, as on the website (frontend/src/lib/categories.ts): sections («Парфюмерия»,
// «Наборы», «Макияж», …) and their groups («Губы»). The API sends the nodes in tree order: each
// section followed by its groups, depth first.

/** Section → group → kind («Макияж» → «Губы» → «Помада»), as on the server. */
export const MAX_DEPTH = 3;

export const KIND_LABELS: Record<CategoryKind, string> = {
  perfume: "Парфюмерия",
  cosmetics: "Косметика",
};

type Node = Pick<Category, "id" | "parent_id" | "name">;

/** The shop's tree: only the nodes with active products. */
export function useCategories() {
  return useApi<Category[]>("/categories");
}

export function childrenOf<T extends Node>(all: T[], parentId: number | null): T[] {
  return all.filter((c) => c.parent_id === parentId);
}

/** From the section down to this node. */
export function pathOf<T extends Node>(all: T[], id: number): T[] {
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
export function fullName(all: Node[], id: number): string {
  return pathOf(all, id)
    .map((c) => c.name)
    .join(" / ");
}

/**
 * The chips over a section's products: its groups, or, on a group without groups of its own, the
 * group and its siblings.
 */
export function chipsFor<T extends Node>(all: T[], id: number): { parent: T | null; chips: T[] } {
  const node = all.find((c) => c.id === id);
  if (!node) return { parent: null, chips: [] };
  const children = childrenOf(all, id);
  if (children.length > 0) return { parent: node, chips: children };
  const parent =
    node.parent_id === null ? null : (all.find((c) => c.id === node.parent_id) ?? null);
  return { parent, chips: parent ? childrenOf(all, parent.id) : [] };
}

/**
 * Opens a node step by step, as on Kaspi and the website: its groups (the categories screen with
 * `parent`) while it has any, else its products (the collection screen).
 */
export function openCategory(all: Node[], node: Pick<Category, "id" | "name">) {
  if (childrenOf(all, node.id).length) {
    router.push({ pathname: "/categories", params: { parent: node.id, title: node.name } });
  } else {
    router.push({ pathname: "/collection", params: { category_id: node.id, title: node.name } });
  }
}
