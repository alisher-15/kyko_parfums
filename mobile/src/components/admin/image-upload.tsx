import { useState } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { ProductImage } from "@/components/product";
import { Button, Muted, Notice } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { formWith, pickImage } from "@/lib/files";
import { colors, radius } from "@/theme";

type Uploaded = { url: string; normalized: boolean; note: string | null };

/**
 * A photo from the gallery or the camera, uploaded to /admin/uploads (as on the website).
 * kind="product": the server makes a white 600×600 square with the bottle at the shop's scale;
 * kind="original": banners and logos, only made smaller.
 */
export function ImageUpload({
  value,
  onChange,
  seed = 0,
  kind = "product",
  previewStyle,
  hint,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  seed?: number;
  kind?: "product" | "original";
  previewStyle?: StyleProp<ViewStyle>;
  hint?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const upload = async (camera: boolean) => {
    setError(null);
    setNote(null);
    const file = await pickImage(camera);
    if (!file) return;
    setBusy(true);
    try {
      const res = await api<Uploaded>("/admin/uploads", { form: formWith(file), query: { kind } });
      onChange(res.url);
      if (kind === "product" && !res.normalized && res.note)
        setNote(`Фото не обработано: ${res.note}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <ProductImage
        uri={value}
        seed={seed}
        style={[
          { borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.line },
          previewStyle ?? { width: 160, height: 160 },
        ]}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button
          small
          kind="outline"
          icon="images-outline"
          title="Из галереи"
          loading={busy}
          onPress={() => void upload(false)}
        />
        <Button
          small
          kind="outline"
          icon="camera-outline"
          title="Снять"
          disabled={busy}
          onPress={() => void upload(true)}
        />
        {value && <Button small kind="ghost" title="Убрать" onPress={() => onChange(null)} />}
      </View>
      {hint && <Muted style={{ fontSize: 12 }}>{hint}</Muted>}
      {note && <Notice tone="warn">{note}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </View>
  );
}
