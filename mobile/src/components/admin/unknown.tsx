import { useState } from "react";
import { View } from "react-native";
import { Button, Muted, Notice, Txt } from "@/components/ui";
import type { AdminVariant, VariantSearchItem } from "@/lib/admin-types";
import { api, errorText } from "@/lib/api";
import { colors, fonts } from "@/theme";
import { Block, VariantSearch } from "./kit";

/** A scanned code that is not in the catalog: attach it to a volume (as on the website). */
export function UnknownBarcode({
  code,
  onAttached,
  onCancel,
}: {
  code: string;
  onAttached: (item: VariantSearchItem) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const attach = async (item: VariantSearchItem) => {
    setBusy(true);
    setError(null);
    try {
      await api<AdminVariant>(`/admin/variants/${item.variant_id}/barcodes`, { body: { code } });
      onAttached(item);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Block
      title="Штрихкод не найден"
      style={{ borderColor: colors.gold, backgroundColor: "#f8ecea" }}
      right={<Button small kind="ghost" title="Отмена" onPress={onCancel} />}
    >
      <Txt style={{ fontFamily: fonts.sansBold }}>{code}</Txt>
      <Muted style={{ fontSize: 13 }}>
        Найдите товар и объём, к которым он относится. Код запомнится, и в следующий раз товар
        определится сам.
      </Muted>
      <View style={{ opacity: busy ? 0.6 : 1 }} pointerEvents={busy ? "none" : "auto"}>
        <VariantSearch
          onPick={(item) => void attach(item)}
          placeholder="Товар для этого штрихкода"
        />
      </View>
      {error && <Notice tone="error">{error}</Notice>}
      <Muted style={{ fontSize: 12 }}>
        Такого товара ещё нет? Создайте его в «Товарах», добавьте объём и отсканируйте код ещё раз.
      </Muted>
    </Block>
  );
}
