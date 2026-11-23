import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { ImageUpload } from "@/components/admin/image-upload";
import { AdminScreen, ChipPicker, confirm } from "@/components/admin/kit";
import { ProductImage } from "@/components/product";
import { Button, ErrorState, Field, Loader, Muted, Notice, Txt } from "@/components/ui";
import type { AdminCategory } from "@/lib/admin-types";
import { api, errorText } from "@/lib/api";
import { KIND_LABELS, MAX_DEPTH, childrenOf, pathOf } from "@/lib/categories";
import { plural } from "@/lib/format";
import { useApi } from "@/lib/queries";
import type { CategoryKind } from "@/lib/types";
import { colors, fonts, radius } from "@/theme";

const KINDS = Object.keys(KIND_LABELS) as CategoryKind[];

type Run = (fn: () => Promise<unknown>) => Promise<boolean>;

/**
 * The catalog tree, as on the website: the sections are the tiles at the top of the home screen
 * (with their picture), the groups the chips on a section's page. A section decides which fields
 * its products have (perfumes: concentration, notes, olfactory group).
 */
export default function CategoriesAdminScreen() {
  return (
    <AdminScreen title="Категории" area={null}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Categories />
      </KeyboardAvoidingView>
    </AdminScreen>
  );
}

function Categories() {
  const queryClient = useQueryClient();
  const tree = useApi<AdminCategory[]>("/admin/categories");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryKind>("cosmetics");
  const [msg, setMsg] = useState<string | null>(null);

  // The shop's tiles and the products' sections change with the tree.
  const run: Run = async (fn) => {
    setMsg(null);
    try {
      await fn();
      await queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          /^\/(admin\/)?(categories|products)/.test(q.queryKey[0]),
      });
      return true;
    } catch (e) {
      setMsg(errorText(e));
      return false;
    }
  };

  if (tree.error && !tree.data)
    return <ErrorState message={tree.error.message} onRetry={() => void tree.refetch()} />;
  if (!tree.data) return <Loader />;
  const all = tree.data;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <Muted style={{ fontSize: 13, lineHeight: 18 }}>
        Разделы — плитки вверху главной (как в Kaspi) в этом порядке, группы — подборки на странице
        раздела. Раздел без товаров не показывается. Картинка плитки — квадратная, предмет на белом
        фоне; без неё берётся фото одного из товаров. У парфюмерии есть концентрация, ноты и
        олфактивная группа, у косметики нет. Не больше трёх уровней: Макияж → Губы → Помада.
      </Muted>
      <View style={styles.card}>
        <Field
          label="Новый раздел"
          value={name}
          onChangeText={setName}
          placeholder="Например, Для мужчин"
          testID="category-new-name"
        />
        <ChipPicker
          label="Тип"
          value={kind}
          options={KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))}
          onChange={(k) => k && setKind(k)}
        />
        <Button
          title="Добавить раздел"
          disabled={!name.trim()}
          onPress={() =>
            void run(() => api("/admin/categories", { body: { name: name.trim(), kind } })).then(
              (ok) => ok && setName(""),
            )
          }
        />
      </View>
      {msg && <Notice tone="error">{msg}</Notice>}
      {childrenOf(all, null).map((section) => (
        <View key={section.id} style={styles.card}>
          <Node node={section} all={all} run={run} />
        </View>
      ))}
    </ScrollView>
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
    run(() => api(`/admin/categories/${node.id}/move`, { body: {}, query: { direction } }));
  const remove = async () => {
    if (!(await confirm("Удалить?", `«${node.name}»`, "Удалить"))) return;
    await run(() => api(`/admin/categories/${node.id}`, { method: "DELETE" }));
  };

  return (
    <View style={{ gap: 6, marginLeft: depth > 1 ? 14 : 0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {depth === 1 && (
          <ProductImage uri={node.image_url} seed={node.id} style={styles.thumb} iconSize={16} />
        )}
        <View style={{ flex: 1 }}>
          <Txt
            style={
              depth === 1
                ? { fontFamily: fonts.serifBold, fontSize: 20 }
                : { fontFamily: fonts.sansSemi, fontSize: 14 }
            }
          >
            {node.name}
          </Txt>
          <Pressable
            accessibilityRole="link"
            onPress={() =>
              router.push({ pathname: "/admin/products", params: { category_id: node.id } })
            }
          >
            <Muted style={{ fontSize: 12 }}>
              {depth === 1 ? `${KIND_LABELS[node.kind]} · ` : ""}
              {node.product_count} {plural(node.product_count, "товар", "товара", "товаров")}
            </Muted>
          </Pressable>
        </View>
      </View>
      <View style={styles.actions}>
        <Button
          small
          kind="outline"
          title="↑"
          accessibilityLabel={`${node.name}: выше`}
          disabled={index <= 0}
          onPress={() => void move("up")}
        />
        <Button
          small
          kind="outline"
          title="↓"
          accessibilityLabel={`${node.name}: ниже`}
          disabled={index === siblings.length - 1}
          onPress={() => void move("down")}
        />
        {depth < MAX_DEPTH && (
          <Button
            small
            kind="outline"
            title={depth === 1 ? "+ Группа" : "+ Вид"}
            onPress={() => setMode(mode === "add" ? "view" : "add")}
          />
        )}
        <Button
          small
          kind="outline"
          title="Изменить"
          onPress={() => setMode(mode === "edit" ? "view" : "edit")}
        />
        <Button
          small
          kind="danger"
          title="Удалить"
          disabled={!empty}
          onPress={() => void remove()}
        />
      </View>
      {mode === "add" && <AddChild parent={node} run={run} onDone={() => setMode("view")} />}
      {mode === "edit" && (
        <EditNode node={node} all={all} run={run} onDone={() => setMode("view")} />
      )}
      {children.map((c) => (
        <Node key={c.id} node={c} all={all} run={run} />
      ))}
    </View>
  );
}

function AddChild({
  parent,
  run,
  onDone,
}: {
  parent: AdminCategory;
  run: Run;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <View style={styles.form}>
      <Field
        label={`Новая группа в «${parent.name}»`}
        value={name}
        onChangeText={setName}
        autoFocus
      />
      <View style={styles.actions}>
        <Button
          small
          title="Добавить"
          disabled={!name.trim()}
          onPress={() =>
            void run(() =>
              api("/admin/categories", { body: { name: name.trim(), parent_id: parent.id } }),
            ).then((ok) => ok && onDone())
          }
        />
        <Button small kind="outline" title="Отмена" onPress={onDone} />
      </View>
    </View>
  );
}

function EditNode({
  node,
  all,
  run,
  onDone,
}: {
  node: AdminCategory;
  all: AdminCategory[];
  run: Run;
  onDone: () => void;
}) {
  const [name, setName] = useState(node.name);
  const [parent, setParent] = useState<number | null>(node.parent_id);
  const [kind, setKind] = useState<CategoryKind>(node.kind);
  const [image, setImage] = useState<string | null>(node.image_url);
  // Where it can go: not into itself or below itself (the server also checks the depth).
  const below = new Set<number>();
  const collect = (id: number) => {
    below.add(id);
    childrenOf(all, id).forEach((c) => collect(c.id));
  };
  collect(node.id);
  const targets = all.filter((c) => !below.has(c.id) && pathOf(all, c.id).length < MAX_DEPTH);

  const save = () => {
    const body: Record<string, unknown> = { name: name.trim() };
    if (parent !== node.parent_id) body.parent_id = parent;
    if (parent === null && kind !== node.kind) body.kind = kind;
    if (image !== node.image_url) body.image_url = image;
    void run(() => api(`/admin/categories/${node.id}`, { method: "PATCH", body })).then(
      (ok) => ok && onDone(),
    );
  };

  return (
    <View style={styles.form}>
      <Field label="Название" value={name} onChangeText={setName} />
      <ChipPicker
        label="Где"
        value={parent}
        allowNone="Отдельный раздел"
        options={targets.map((c) => ({
          value: c.id,
          label: pathOf(all, c.id)
            .map((p) => p.name)
            .join(" / "),
        }))}
        onChange={setParent}
      />
      {parent === null && (
        <>
          <ChipPicker
            label="Тип"
            value={kind}
            options={KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))}
            onChange={(k) => k && setKind(k)}
          />
          <ImageUpload
            value={image}
            seed={node.id}
            onChange={setImage}
            previewStyle={{ width: 96, height: 96 }}
            hint="Картинка плитки на главной: квадрат, предмет на белом фоне."
          />
        </>
      )}
      <View style={styles.actions}>
        <Button small title="Сохранить" disabled={!name.trim()} onPress={save} />
        <Button small kind="outline" title="Отмена" onPress={onDone} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 12,
    gap: 10,
  },
  thumb: { width: 44, height: 44, borderRadius: radius.sm, overflow: "hidden" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  form: {
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 10,
  },
});
