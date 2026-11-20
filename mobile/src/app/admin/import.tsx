import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { AdminScreen, Block } from "@/components/admin/kit";
import { Button, Field, Muted, Notice, Txt } from "@/components/ui";
import type { ImportReport } from "@/lib/admin-types";
import { api, errorText } from "@/lib/api";
import { XLSX, formWith, pickSpreadsheet, saveAndShare, type PickedFile } from "@/lib/files";
import { colors, fonts, radius } from "@/theme";

export default function ImportScreen() {
  return (
    <AdminScreen title="Импорт Excel" area={null}>
      <Import />
    </AdminScreen>
  );
}

function Import() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [sheet, setSheet] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"check" | "import" | "file" | null>(null);

  const pick = async () => {
    setError(null);
    const f = await pickSpreadsheet();
    if (f) {
      setFile(f);
      setReport(null);
    }
  };

  const run = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(dryRun ? "check" : "import");
    setError(null);
    setReport(null);
    try {
      setReport(
        await api<ImportReport>("/admin/import/catalog", {
          form: formWith(file),
          query: { dry_run: dryRun, sheet: sheet.trim() || undefined },
        }),
      );
      // A real import changes the catalog everywhere: lists, cards, prices.
      if (!dryRun) await queryClient.invalidateQueries();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const download = async (path: string, name: string) => {
    setBusy("file");
    setError(null);
    try {
      await saveAndShare(path, name, XLSX);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button
          small
          kind="outline"
          icon="document-outline"
          title="Шаблон"
          disabled={busy !== null}
          onPress={() => void download("/admin/import/template", "catalog_template.xlsx")}
        />
        <Button
          small
          kind="outline"
          icon="download-outline"
          title="Весь каталог"
          disabled={busy !== null}
          onPress={() =>
            void download(
              "/admin/import/export",
              `catalog_${new Date().toISOString().slice(0, 10)}.xlsx`,
            )
          }
        />
      </View>

      <Block title="Загрузить файл">
        <Button
          kind="outline"
          icon="attach-outline"
          title={file ? file.name : "Выбрать файл .xlsx или .csv"}
          onPress={() => void pick()}
          testID="import-pick"
        />
        <Field
          label="Лист (необязательно)"
          placeholder="по умолчанию — активный"
          value={sheet}
          onChangeText={setSheet}
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            kind="outline"
            title="Проверить"
            style={{ flex: 1 }}
            loading={busy === "check"}
            disabled={!file || busy !== null}
            onPress={() => void run(true)}
            testID="import-check"
          />
          <Button
            title="Импортировать"
            style={{ flex: 1 }}
            loading={busy === "import"}
            disabled={!file || busy !== null}
            onPress={() => void run(false)}
            testID="import-run"
          />
        </View>
        <Muted style={{ fontSize: 12 }}>
          «Проверить» ничего не записывает: покажет, что сделает импорт.
        </Muted>
      </Block>

      {error && <Notice tone="error">{error}</Notice>}
      {report && <Report report={report} />}

      <Block title="Как устроен файл">
        <Muted style={{ fontSize: 13 }}>
          Строка заголовков ищется сама; колонки узнаются по названию: Бренд, Название, Тип,
          Категория, Пол, Стойкость, ноты, Описание, Фото, Объём, Тестер, Розница, Опт, Крупный опт,
          Остаток, Артикул, Штрихкод (несколько — через запятую), Себестоимость.
        </Muted>
        <Muted style={{ fontSize: 13 }}>
          Одна строка — товар и его объём. Строки с одинаковым брендом, названием и типом добавляют
          объёмы к одному товару. Повторный импорт обновляет товары; пустые ячейки ничего не
          затирают. Тестер — «да» в колонке «Тестер» или слово «тестер» в названии, объёме или типе.
        </Muted>
        <Muted style={{ fontSize: 13 }}>
          «Весь каталог» — товары сайта в этом же формате, по строке на объём: поправьте в Excel и
          загрузите обратно. Остатков в файле нет, они меняются через склад. По себестоимости и
          ценам каждый объём запоминает наценку. Колонки «Цена Канат», «Цена Эрик» — для сравнения,
          при загрузке они ничего не меняют.
        </Muted>
      </Block>
    </ScrollView>
  );
}

function Report({ report }: { report: ImportReport }) {
  const stats: [string, number][] = [
    ["Строк в файле", report.rows_total],
    ["Пропущено строк", report.rows_skipped],
    ["Новых брендов", report.brands_created],
    ["Новых товаров", report.products_created],
    ["Обновлено товаров", report.products_updated],
    ["Новых объёмов", report.variants_created],
    ["Обновлено объёмов", report.variants_updated],
    ["Тестеров в файле", report.tester_rows],
    ["Новых штрихкодов", report.barcodes_added],
  ];
  return (
    <View style={{ gap: 12 }} testID="import-report">
      <Notice tone="success">
        {report.dry_run
          ? "Проверка завершена — в базу ничего не записано. Так будет выглядеть импорт:"
          : "Импорт выполнен."}
      </Notice>
      <View style={styles.grid}>
        {stats.map(([label, value]) => (
          <View key={label} style={styles.stat}>
            <Muted style={{ fontSize: 12 }}>{label}</Muted>
            <Txt style={{ fontFamily: fonts.sansBold, fontSize: 22 }}>{value}</Txt>
          </View>
        ))}
      </View>
      {report.unmapped_columns.length > 0 && (
        <Notice tone="warn">
          Не распознаны колонки (пропущены): {report.unmapped_columns.join(", ")}
        </Notice>
      )}
      {report.errors.length > 0 && (
        <Block title={`Замечания · ${report.errors.length}`}>
          {report.errors.slice(0, 200).map((e, i) => (
            <Txt key={i} style={{ fontSize: 13 }}>
              <Text style={{ color: colors.muted }}>Строка {e.row}: </Text>
              {e.error}
            </Txt>
          ))}
          {report.errors.length > 200 && <Muted>…и ещё {report.errors.length - 200}</Muted>}
        </Block>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: {
    flexBasis: "30%",
    flexGrow: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 10,
    gap: 2,
  },
});
