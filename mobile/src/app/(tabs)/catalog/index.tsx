import { useLocalSearchParams } from "expo-router";
import { CatalogView } from "@/components/catalog";

/**
 * The catalog tab. The home screen's search opens it with `q` and `at`: a new `at` starts the
 * catalog afresh with that search (the same words typed again run again); its search icon
 * opens it with `focus`, to open the keyboard in the field.
 */
export default function CatalogScreen() {
  const { q, at, focus } = useLocalSearchParams<{ q?: string; at?: string; focus?: string }>();
  return <CatalogView key={at ?? "catalog"} query={q} focusKey={focus} title="Каталог" />;
}
