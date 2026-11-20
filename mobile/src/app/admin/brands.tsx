import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { ImageUpload } from "@/components/admin/image-upload";
import { AdminScreen, SearchBox, confirm } from "@/components/admin/kit";
import { ProductImage } from "@/components/product";
import { Button, ErrorState, Field, Loader, Muted, Notice, Txt } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { plural } from "@/lib/format";
import { useApi } from "@/lib/queries";
import type { Brand } from "@/lib/types";
import { colors, fonts, radius } from "@/theme";

export default function BrandsAdminScreen() {
  return (
    <AdminScreen title="Бренды" area={null}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Brands />
      </KeyboardAvoidingView>
    </AdminScreen>
  );
}

function Brands() {
  const queryClient = useQueryClient();
  const brands = useApi<Brand[]>("/admin/brands");
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The storefront's brand lists and the products' brand names change with them.
  const reload = () =>
    queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" && /^\/(admin\/)?(brands|products)/.test(q.queryKey[0]),
    });

  const create = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api("/admin/brands", { body: { name: name.trim() } });
      setName("");
      await reload();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (brands.error && !brands.data)
    return <ErrorState message={brands.error.message} onRetry={() => void brands.refetch()} />;
  if (!brands.data) return <Loader />;
  const list = brands.data.filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <FlatList
      data={list}
      keyExtractor={(b) => String(b.id)}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }}
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 8 }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
            <Field
              label="Новый бренд"
              value={name}
              onChangeText={setName}
              style={{ flex: 1 }}
              testID="brand-new-name"
              onSubmitEditing={() => name.trim() && void create()}
            />
            <Button
              title="Добавить"
              testID="brand-add"
              loading={busy}
              disabled={!name.trim()}
              onPress={() => void create()}
            />
          </View>
          {msg && <Notice tone="error">{msg}</Notice>}
          <SearchBox
            value={filter}
            onChange={setFilter}
            placeholder={`Фильтр · ${brands.data.length}`}
          />
        </View>
      }
      ListEmptyComponent={<Muted style={{ textAlign: "center" }}>Ничего не нашлось</Muted>}
      renderItem={({ item }) => (
        <BrandRow
          brand={item}
          open={open === item.id}
          onToggle={() => setOpen(open === item.id ? null : item.id)}
          onChanged={reload}
        />
      )}
    />
  );
}

function BrandRow({
  brand,
  open,
  onToggle,
  onChanged,
}: {
  brand: Brand;
  open: boolean;
  onToggle: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const [name, setName] = useState(brand.name);
  const [logo, setLogo] = useState(brand.logo_url);
  const [description, setDescription] = useState(brand.description ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, okText?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await onChanged();
      if (okText) setMsg({ ok: true, text: okText });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirm("Удалить бренд?", brand.name, "Удалить"))) return;
    await run(() => api(`/admin/brands/${brand.id}`, { method: "DELETE" }));
  };

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        testID={`brand-${brand.id}`}
        onPress={onToggle}
        style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        <ProductImage uri={brand.logo_url} seed={brand.id} style={styles.logo} iconSize={16} />
        <View style={{ flex: 1 }}>
          <Txt style={{ fontFamily: fonts.sansSemi, fontSize: 15 }}>{brand.name}</Txt>
          <Muted style={{ fontSize: 12 }}>
            {brand.product_count} {plural(brand.product_count, "товар", "товара", "товаров")}
          </Muted>
        </View>
        <Muted>{open ? "▲" : "▼"}</Muted>
      </Pressable>
      {open && (
        <View style={{ gap: 10, marginTop: 10 }}>
          <Field label="Название" value={name} onChangeText={setName} />
          <ImageUpload
            kind="original"
            value={logo}
            seed={brand.id}
            onChange={setLogo}
            previewStyle={{ width: 96, height: 96 }}
            hint="Логотип для страницы брендов."
          />
          <Field label="Описание" value={description} onChangeText={setDescription} multiline />
          {msg && <Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice>}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              title="Сохранить"
              style={{ flex: 1 }}
              loading={busy}
              disabled={!name.trim()}
              onPress={() =>
                void run(
                  () =>
                    api(`/admin/brands/${brand.id}`, {
                      method: "PATCH",
                      body: {
                        name: name.trim(),
                        logo_url: logo,
                        description: description.trim() || null,
                      },
                    }),
                  "Сохранено",
                )
              }
            />
            <Button
              kind="danger"
              title="Удалить"
              disabled={busy || brand.product_count > 0}
              onPress={() => void remove()}
            />
          </View>
          {brand.product_count > 0 && (
            <Muted style={{ fontSize: 12 }}>
              Бренд с товарами удалить нельзя: сначала перенесите или удалите их.
            </Muted>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 10,
  },
  logo: { width: 44, height: 44, borderRadius: radius.sm, overflow: "hidden" },
});
