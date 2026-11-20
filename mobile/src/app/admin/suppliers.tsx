import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { AdminScreen, Block, KV, VariantSearch, confirm } from "@/components/admin/kit";
import { Button, ErrorState, Loader, Muted, Notice, Txt } from "@/components/ui";
import type {
  LinksReport,
  PriceChangeLine,
  PriceFormat,
  PriceListReport,
  Supplier,
  UnmatchedLine,
} from "@/lib/admin-types";
import { api, errorText } from "@/lib/api";
import { XLSX, formWith, pickSpreadsheet, saveAndShare, type PickedFile } from "@/lib/files";
import { dateTime, plural, tenge } from "@/lib/format";
import { useApi } from "@/lib/queries";
import { colors, fonts, radius } from "@/theme";

const FORMATS: Record<PriceFormat, string> = {
  usd_1c: "Прайс-лист 1С: цена в долларах и «ОПТ,ЦЕНА» в тенге",
  barcode_kzt: "Прайс со штрихкодами: «ОПТ» в тенге",
};

// How many unmatched lines and changes to show before «Показать все».
const SHOWN = 20;

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const volumes = (n: number) => `${n} ${plural(n, "объёма", "объёмов", "объёмов")}`;

// Words of a price list line that say nothing about which perfume it is.
const NOISE = new Set(
  "edp edt edc eau de parfum parfume perfume extrait tester test new pour homme femme men women for spray ml m w l u".split(
    " ",
  ),
);

/** A search to start linking a line with: its first two words, without volume, type and notes. */
function guess(line: string): string {
  return line
    .replace(/\([^)]*\)/g, " ")
    .replace(/\d+([.,]\d+)?\s*(ml|мл|g)?\b/gi, " ")
    .replace(/[^\p{L}\p{N}&' -]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w.toLowerCase()))
    .slice(0, 2)
    .join(" ");
}

export default function SuppliersScreen() {
  return (
    <AdminScreen title="Поставщики" area={null}>
      <Suppliers />
    </AdminScreen>
  );
}

function Suppliers() {
  const suppliers = useApi<Supplier[]>("/admin/suppliers");
  if (suppliers.error && !suppliers.data)
    return (
      <ErrorState message={suppliers.error.message} onRetry={() => void suppliers.refetch()} />
    );
  if (!suppliers.data) return <Loader />;
  return (
    <FlatList
      data={suppliers.data}
      keyExtractor={(s) => String(s.id)}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      ListHeaderComponent={
        <Muted style={{ fontSize: 13 }}>
          Себестоимость объёма — цена основного поставщика, а если у него этого товара нет — цена
          другого. Когда прайс меняет себестоимость, цены продажи считаются по наценкам объёма и
          никогда не снижаются. Сначала приложение показывает, что изменится, а применяет только по
          кнопке.
        </Muted>
      }
      renderItem={({ item }) => <SupplierCard supplier={item} />}
    />
  );
}

function SupplierCard({ supplier }: { supplier: Supplier }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [report, setReport] = useState<PriceListReport | null>(null);
  const [linksReport, setLinksReport] = useState<LinksReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const last = supplier.last_list;

  // Costs and prices of many products may have changed.
  const reload = () =>
    queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0] !== "/admin/orders",
    });

  const send = (f: PickedFile, dryRun: boolean) =>
    api<PriceListReport>(`/admin/suppliers/${supplier.id}/price-list`, {
      form: formWith(f),
      query: { dry_run: dryRun },
    });

  const check = async (f: PickedFile) => {
    setBusy(true);
    setError(null);
    try {
      setReport(await send(f, true));
    } catch (e) {
      setReport(null);
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const pickList = async () => {
    const f = await pickSpreadsheet();
    if (!f) return;
    setFile(f);
    setNotice(null);
    await check(f);
  };

  const apply = async () => {
    if (!file || !report) return;
    const ok = await confirm(
      "Загрузить прайс?",
      `«${file.name}»: цены продажи изменятся у ${volumes(report.prices_raised)}.`,
      "Применить",
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const r = await send(file, false);
      setReport(null);
      setFile(null);
      setNotice(
        `Прайс «${file.name}» загружен: сопоставлено ${r.matched} из ${r.lines} строк, ` +
          `цены выросли у ${volumes(r.prices_raised)}.`,
      );
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const link = async (line: string, variantId: number | null) => {
    await api(`/admin/suppliers/${supplier.id}/links`, { body: { line, variant_id: variantId } });
    void queryClient.invalidateQueries({ queryKey: ["/admin/suppliers"] });
    if (file) await check(file);
  };

  const importLinks = async () => {
    const f = await pickSpreadsheet();
    if (!f) return;
    setBusy(true);
    setError(null);
    setLinksReport(null);
    try {
      setLinksReport(
        await api<LinksReport>(`/admin/suppliers/${supplier.id}/links/import`, {
          form: formWith(f),
        }),
      );
      void queryClient.invalidateQueries({ queryKey: ["/admin/suppliers"] });
      if (file) await check(file);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const exportLinks = async () => {
    setError(null);
    try {
      await saveAndShare(
        `/admin/suppliers/${supplier.id}/links/export`,
        `сопоставление_${supplier.name}.xlsx`,
        XLSX,
      );
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Block
      title={supplier.name}
      right={supplier.is_main ? <Text style={styles.main}>основной</Text> : undefined}
    >
      <Muted style={{ fontSize: 13 }}>{FORMATS[supplier.price_format]}</Muted>
      <KV label="Цены у товаров" value={volumes(supplier.prices)} />
      <KV
        label="Строк прайса привязано"
        value={`${supplier.links}${supplier.ignored > 0 ? ` · не наш товар: ${supplier.ignored}` : ""}`}
      />
      <KV
        label="Последний прайс"
        value={
          last
            ? `${last.file_name}\n${dateTime(last.uploaded_at)} · сопоставлено ${last.matched} из ${last.lines}`
            : "ещё не загружали"
        }
      />
      <Button
        icon="cloud-upload-outline"
        title="Загрузить прайс"
        loading={busy && !report}
        disabled={busy}
        onPress={() => void pickList()}
        testID={`supplier-${supplier.id}-upload`}
      />
      {notice && <Notice tone="success">{notice}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {report && file && (
        <ReportView
          report={report}
          fileName={file.name}
          busy={busy}
          onApply={() => void apply()}
          onCancel={() => {
            setReport(null);
            setFile(null);
          }}
          onLink={link}
        />
      )}
      <View style={styles.links}>
        <Txt style={{ fontFamily: fonts.sansSemi, fontSize: 14 }}>
          Сопоставление строк прайса с товарами
        </Txt>
        <Muted style={{ fontSize: 12 }}>
          Приложение запоминает, какой товар какой строке прайса соответствует. Сопоставление можно
          скачать, поправить в Excel и загрузить обратно.
        </Muted>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Button
            small
            kind="outline"
            icon="download-outline"
            title="Скачать"
            onPress={() => void exportLinks()}
          />
          <Button
            small
            kind="outline"
            icon="cloud-upload-outline"
            title="Загрузить"
            disabled={busy}
            onPress={() => void importLinks()}
          />
        </View>
        {linksReport && (
          <Notice tone={linksReport.problems.length ? "warn" : "success"}>
            Строк: {linksReport.rows}, привязано: {linksReport.linked}, не наш товар:{" "}
            {linksReport.ignored}.
            {linksReport.problems.length > 0 &&
              `\nНе получилось: ${linksReport.problems.length}.\n` +
                linksReport.problems
                  .slice(0, 20)
                  .map((p) => `Строка ${p.row}: ${p.line} — ${p.error}`)
                  .join("\n")}
          </Notice>
        )}
      </View>
    </Block>
  );
}

function ReportView({
  report,
  fileName,
  busy,
  onApply,
  onCancel,
  onLink,
}: {
  report: PriceListReport;
  fileName: string;
  busy: boolean;
  onApply: () => void;
  onCancel: () => void;
  onLink: (line: string, variantId: number | null) => Promise<void>;
}) {
  const [allLines, setAllLines] = useState(false);
  const [allChanges, setAllChanges] = useState(false);
  const unmatched = allLines ? report.unmatched : report.unmatched.slice(0, SHOWN);
  const changes = allChanges ? report.changes : report.changes.slice(0, SHOWN);
  const facts: string[] = [];
  if (report.supplier_new) facts.push(`новая цена поставщика у ${volumes(report.supplier_new)}`);
  if (report.supplier_up) facts.push(`цена поставщика выросла у ${volumes(report.supplier_up)}`);
  if (report.supplier_down) facts.push(`снизилась у ${volumes(report.supplier_down)}`);

  return (
    <View style={styles.report} testID="price-list-report">
      <Txt style={{ fontFamily: fonts.sansBold }}>
        Проверка «{fileName}» — ещё ничего не изменено
      </Txt>
      <Txt style={{ fontSize: 13 }}>
        Строк с ценой: {report.lines}. Сопоставлено: {report.matched}
        {report.by_barcode > 0 && ` (по штрихкоду ${report.by_barcode})`}, не наш товар:{" "}
        {report.ignored}, не сопоставлено: {report.unmatched.length}.
        {report.duplicates > 0 &&
          ` Строк с тем же товаром, что и в другой строке: ${report.duplicates} (берётся большая цена).`}
      </Txt>
      {facts.length > 0 && <Txt style={{ fontSize: 13 }}>{upperFirst(facts.join(", "))}.</Txt>}
      <Txt style={{ fontSize: 13 }}>
        Себестоимость выросла у {volumes(report.cost_up)}, снизилась у {volumes(report.cost_down)}
        {report.prices_kept > 0 &&
          ` (у ${volumes(report.prices_kept)} цены продажи остаются прежними)`}
        .{" "}
        <Text style={{ fontFamily: fonts.sansBold }}>
          Цены продажи вырастут у {volumes(report.prices_raised)}.
        </Text>
        {report.remembered > 0 &&
          ` У ${volumes(report.remembered)} это первая себестоимость: запомнятся наценки их цен, цены не изменятся.`}
      </Txt>
      {report.waiting_for_main && (
        <Notice tone="warn">
          Прайс основного поставщика ещё не загружали. Пока его нет, этот прайс только запоминает
          цены поставщика: себестоимость и цены продажи не изменятся.
        </Notice>
      )}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          kind="gold"
          title="Применить"
          style={{ flex: 1 }}
          loading={busy}
          onPress={onApply}
          testID="price-list-apply"
        />
        <Button kind="outline" title="Отмена" disabled={busy} onPress={onCancel} />
      </View>

      {report.unmatched.length > 0 && (
        <View style={{ gap: 8 }}>
          <Txt style={{ fontFamily: fonts.sansSemi }}>
            Не сопоставлено: {report.unmatched.length}
            <Text style={{ color: colors.muted, fontFamily: fonts.sans }}>
              {" "}
              — привяжите строку к товару или отметьте «не наш товар»
            </Text>
          </Txt>
          {unmatched.map((u) => (
            <UnmatchedRow key={`${u.row}:${u.line}`} item={u} onLink={onLink} />
          ))}
          {!allLines && report.unmatched.length > SHOWN && (
            <Button
              small
              kind="ghost"
              title={`Показать все ${report.unmatched.length}`}
              onPress={() => setAllLines(true)}
            />
          )}
        </View>
      )}

      {report.changes.length > 0 && (
        <View style={{ gap: 8 }}>
          <Txt style={{ fontFamily: fonts.sansSemi }}>Что изменится</Txt>
          {changes.map((c) => (
            <ChangeRow key={c.variant_id} change={c} />
          ))}
          {!allChanges && report.changes.length > SHOWN && (
            <Button
              small
              kind="ghost"
              title={`Показать все ${report.changes.length}`}
              onPress={() => setAllChanges(true)}
            />
          )}
        </View>
      )}
    </View>
  );
}

function UnmatchedRow({
  item,
  onLink,
}: {
  item: UnmatchedLine;
  onLink: (line: string, variantId: number | null) => Promise<void>;
}) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (variantId: number | null) => {
    setBusy(true);
    setError(null);
    try {
      await onLink(item.line, variantId);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <View style={styles.line}>
      <Txt style={{ fontFamily: fonts.sansMedium, fontSize: 14 }}>{item.line}</Txt>
      <Muted style={{ fontSize: 12 }}>
        {tenge(item.price)}
        {item.barcode ? ` · ${item.barcode}` : ""} · строка {item.row}
      </Muted>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          small
          kind="outline"
          title="Привязать"
          disabled={busy}
          onPress={() => setPicking(!picking)}
        />
        <Button
          small
          kind="outline"
          title="Не наш товар"
          disabled={busy}
          onPress={() => void run(null)}
        />
      </View>
      {picking && (
        <VariantSearch
          initialQuery={guess(item.line)}
          placeholder="Найдите товар на сайте"
          onPick={(v) => void run(v.variant_id)}
        />
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </View>
  );
}

function Change({ label, from, to }: { label: string; from: number | null; to: number | null }) {
  if (from === to) return <KV label={label} value={tenge(to)} />;
  return (
    <KV
      label={label}
      value={
        <>
          <Text style={{ color: colors.muted }}>{tenge(from)} → </Text>
          <Text
            style={{
              fontFamily: fonts.sansBold,
              color: from !== null && to !== null && to < from ? colors.ok : colors.ink,
            }}
          >
            {tenge(to)}
          </Text>
        </>
      }
    />
  );
}

function ChangeRow({ change: c }: { change: PriceChangeLine }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/admin/products/${c.product_id}`)}
      style={({ pressed }) => [styles.line, pressed && { opacity: 0.7 }]}
    >
      <Txt style={{ fontFamily: fonts.sansSemi, fontSize: 14 }}>{c.label}</Txt>
      <Muted style={{ fontSize: 12 }}>{c.line}</Muted>
      <Change label="Поставщик" from={c.supplier_old} to={c.supplier_new} />
      <Change label="Себестоимость" from={c.cost_old} to={c.cost_new} />
      <Change label="Розница" from={c.retail_old} to={c.retail_new} />
      <Change label="Опт" from={c.wholesale_old} to={c.wholesale_new} />
      <Change label="Кр. опт" from={c.bulk_old} to={c.bulk_new} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  main: { color: colors.goldDark, fontFamily: fonts.sansSemi, fontSize: 12 },
  report: {
    gap: 10,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.cream,
    borderRadius: radius.md,
    padding: 12,
  },
  line: {
    gap: 6,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 10,
  },
  links: { gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 },
});
