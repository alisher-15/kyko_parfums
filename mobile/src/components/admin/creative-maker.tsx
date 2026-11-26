import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SearchBox } from "@/components/admin/kit";
import { ProductImage } from "@/components/product";
import { Button, Chip, Field, Muted, Notice, Txt } from "@/components/ui";
import type { AdminProduct, CreativeOut } from "@/lib/admin-types";
import { api, errorText } from "@/lib/api";
import { shareDataUrl } from "@/lib/files";
import { useApi } from "@/lib/queries";
import type { BrandBrief, Page } from "@/lib/types";
import { colors, fonts, radius } from "@/theme";

export type CreativeFormat = "banner" | "story";
export type CreativeTheme = "jewel" | "dark" | "light" | "gold";
type Chosen = { id: number; name: string; type?: string | null; brand: BrandBrief };

export interface CreativeDraft {
  format: CreativeFormat;
  theme: CreativeTheme;
  title: string;
  subtitle: string;
  badge: string;
  note: string;
  products: Chosen[];
}

const FORMATS: { value: CreativeFormat; label: string; hint: string }[] = [
  { value: "banner", label: "Баннер 1200×800", hint: "карточка акции" },
  { value: "story", label: "Сторис 1080×1920", hint: "Instagram, WhatsApp" },
];
const THEMES: { value: CreativeTheme; label: string; swatch: string }[] = [
  { value: "jewel", label: "Шкатулка", swatch: colors.velvet },
  { value: "dark", label: "Тёмный", swatch: colors.ink },
  { value: "light", label: "Светлый", swatch: colors.cream },
  { value: "gold", label: "Золотой", swatch: colors.goldSoft },
];
const MAX_PRODUCTS = 3;

/**
 * A banner or a story drawn from the shop's templates (POST /admin/creatives/render), as on the
 * website (frontend/src/components/admin/CreativeMaker.tsx): the title, the badge, the date and
 * up to three real bottles of the catalog. The preview redraws a moment after a change;
 * «Поделиться» sends it to Instagram or WhatsApp, and with `onUse` (the promotion form) the banner
 * is stored and becomes the promotion's picture.
 */
export function CreativeMaker({
  initial,
  onUse,
  lockFormat = false,
}: {
  initial?: Partial<CreativeDraft>;
  onUse?: (url: string) => void;
  lockFormat?: boolean;
}) {
  const [draft, setDraft] = useState<CreativeDraft>({
    format: "banner",
    theme: "jewel",
    title: "",
    subtitle: "",
    badge: "",
    note: "",
    products: [],
    ...initial,
  });
  const [preview, setPreview] = useState<{ key: string; src: string; missing: number[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"share" | "use" | null>(null);

  const body = {
    format: draft.format,
    theme: draft.theme,
    title: draft.title.trim(),
    subtitle: draft.subtitle,
    badge: draft.badge,
    note: draft.note,
    product_ids: draft.products.map((p) => p.id),
  };
  const key = JSON.stringify(body);
  const fresh = preview?.key === key;

  // Redraw a moment after the last change.
  useEffect(() => {
    const request = JSON.parse(key) as typeof body;
    if (!request.title) return;
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const r = await api<CreativeOut>("/admin/creatives/render", { body: request });
        if (!stale) {
          setPreview({ key, src: r.preview ?? "", missing: r.missing_photos });
          setError(null);
        }
      } catch (e) {
        if (!stale) setError(errorText(e));
      }
    }, 600);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
    // `key` is the request: body is rebuilt on every render.
  }, [key]);

  const set = <K extends keyof CreativeDraft>(k: K, v: CreativeDraft[K]) =>
    setDraft({ ...draft, [k]: v });

  const share = async () => {
    if (!preview?.src) return;
    setBusy("share");
    setError(null);
    try {
      await shareDataUrl(preview.src, `kyko-${draft.format}.jpg`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const use = async () => {
    if (!onUse) return;
    setBusy("use");
    setError(null);
    try {
      const r = await api<CreativeOut>("/admin/creatives/render", {
        body,
        query: { save: true },
      });
      if (r.url) onUse(r.url);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: 14 }} testID="creative-maker">
      {!lockFormat && (
        <View style={styles.row}>
          {FORMATS.map((f) => {
            const on = draft.format === f.value;
            return (
              <Pressable
                key={f.value}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => set("format", f.value)}
                style={[styles.format, on && styles.formatOn]}
              >
                <Text style={[styles.formatTitle, on && { color: colors.white }]}>{f.label}</Text>
                <Text style={[styles.formatHint, on && { color: "#d6d3d1" }]}>{f.hint}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <View style={styles.row}>
        {THEMES.map((t) => (
          <Pressable
            key={t.value}
            accessibilityRole="button"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: draft.theme === t.value }}
            onPress={() => set("theme", t.value)}
            style={[styles.theme, draft.theme === t.value && styles.themeOn]}
          >
            <View style={[styles.swatch, { backgroundColor: t.swatch }]} />
            <Text style={styles.themeText}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <View
        style={[
          styles.preview,
          draft.format === "banner"
            ? { aspectRatio: 3 / 2, width: "100%" }
            : { aspectRatio: 9 / 16, width: "70%", alignSelf: "center" },
        ]}
      >
        {preview?.src ? (
          <Image
            testID="creative-preview"
            source={{ uri: preview.src }}
            style={[StyleSheet.absoluteFill, !fresh && { opacity: 0.6 }]}
            contentFit="contain"
          />
        ) : (
          <Muted style={styles.empty}>Напишите заголовок — превью появится здесь</Muted>
        )}
      </View>
      {preview && preview.missing.length > 0 && (
        <Notice tone="warn">У части товаров не нашлось фото — их место осталось пустым.</Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <View style={styles.row}>
        <Button
          small
          kind="outline"
          icon="share-outline"
          title="Поделиться"
          testID="creative-share"
          disabled={!fresh || busy !== null}
          loading={busy === "share"}
          onPress={() => void share()}
        />
        {onUse && draft.format === "banner" && (
          <Button
            small
            kind="gold"
            title="Поставить баннером акции"
            testID="creative-use"
            disabled={!fresh || busy !== null}
            loading={busy === "use"}
            onPress={() => void use()}
          />
        )}
      </View>

      <Field
        label="Заголовок"
        placeholder="Новогодняя неделя Tom Ford"
        maxLength={80}
        value={draft.title}
        onChangeText={(t) => set("title", t)}
        testID="creative-title"
      />
      <Field
        label="Подзаголовок"
        placeholder="Скидка на культовые ароматы к праздникам"
        maxLength={160}
        value={draft.subtitle}
        onChangeText={(t) => set("subtitle", t)}
      />
      <View style={styles.row}>
        <Field
          label="Плашка"
          placeholder="−15%"
          maxLength={16}
          value={draft.badge}
          onChangeText={(t) => set("badge", t)}
          style={{ width: 110 }}
        />
        <Field
          label="Рядом с плашкой"
          placeholder="до 31 декабря"
          maxLength={40}
          value={draft.note}
          onChangeText={(t) => set("note", t)}
          style={{ flex: 1 }}
        />
      </View>
      <ProductChooser selected={draft.products} onChange={(p) => set("products", p)} />
    </View>
  );
}

/** Up to three products for the picture, found by name or brand. */
function ProductChooser({
  selected,
  onChange,
}: {
  selected: Chosen[];
  onChange: (products: Chosen[]) => void;
}) {
  const [search, setSearch] = useState("");
  const full = selected.length >= MAX_PRODUCTS;
  const found = useApi<Page<AdminProduct>>(search.length >= 2 && !full ? "/admin/products" : null, {
    q: search,
    page_size: 8,
  });
  const ids = new Set(selected.map((p) => p.id));
  return (
    <View style={{ gap: 8 }}>
      <Txt style={{ fontFamily: fonts.sansSemi }}>
        Флаконы на картинке · {selected.length} из {MAX_PRODUCTS}
      </Txt>
      {selected.length > 0 && (
        <View style={styles.row}>
          {selected.map((p) => (
            <Chip
              key={p.id}
              label={`${p.brand.name} ${p.name}${p.type ? ` · ${p.type}` : ""}  ×`}
              onPress={() => onChange(selected.filter((x) => x.id !== p.id))}
            />
          ))}
        </View>
      )}
      {full ? (
        <Muted style={{ fontSize: 12 }}>Уже три флакона — нажмите на один, чтобы убрать.</Muted>
      ) : (
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Найти товар: название или бренд"
          testID="creative-product-search"
        />
      )}
      {!full &&
        search.length >= 2 &&
        found.data?.items.map((p) => {
          const photo = p.image_url ?? p.variants.find((v) => v.photo_url)?.photo_url ?? null;
          const added = ids.has(p.id);
          return (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              testID={`creative-add-${p.id}`}
              disabled={added}
              onPress={() => {
                onChange([...selected, { id: p.id, name: p.name, type: p.type, brand: p.brand }]);
                setSearch("");
              }}
              style={({ pressed }) => [styles.found, (pressed || added) && { opacity: 0.5 }]}
            >
              <ProductImage uri={photo} seed={p.id} style={styles.thumb} iconSize={14} />
              <Txt style={{ flex: 1, fontSize: 14 }} numberOfLines={2}>
                <Text style={{ color: colors.muted }}>{p.brand.name}</Text> {p.name}
                {p.type ? <Text style={{ color: colors.muted }}> · {p.type}</Text> : null}
                {!photo ? <Text style={{ color: colors.warn }}> · нет фото</Text> : null}
              </Txt>
              <Ionicons
                name={added ? "checkmark" : "add"}
                size={18}
                color={added ? colors.muted : colors.goldDark}
              />
            </Pressable>
          );
        })}
      {!full && search.length >= 2 && found.data?.items.length === 0 && (
        <Muted style={{ fontSize: 13 }}>Ничего не найдено</Muted>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  format: {
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  formatOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  formatTitle: { fontFamily: fonts.sansSemi, fontSize: 14, color: colors.ink },
  formatHint: { fontFamily: fonts.sans, fontSize: 11, color: colors.muted },
  theme: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  themeOn: { borderColor: colors.ink, borderWidth: 2 },
  themeText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.ink },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.line,
  },
  preview: {
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: "#f0efed",
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: "center",
  },
  empty: { textAlign: "center", padding: 16, fontSize: 13 },
  found: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 6,
  },
  thumb: { width: 40, height: 40, borderRadius: radius.sm, overflow: "hidden" },
});
