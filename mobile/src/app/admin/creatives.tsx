import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { CreativeMaker } from "@/components/admin/creative-maker";
import { AdminScreen, Block } from "@/components/admin/kit";
import { Muted } from "@/components/ui";

/** Banners and stories from the shop's templates, with the catalog's own bottles. */
export default function CreativesScreen() {
  return (
    <AdminScreen title="Баннеры и сторис" area={null}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <Muted style={{ fontSize: 13 }}>
            Картинка по шаблону магазина: заголовок, плашка со скидкой, дата и до трёх настоящих
            флаконов из каталога. Баннер — для карточки акции на главной, сторис — для Instagram и
            статуса в WhatsApp. «Поделиться» отправит картинку куда нужно.
          </Muted>
          <Block>
            <CreativeMaker />
          </Block>
        </ScrollView>
      </KeyboardAvoidingView>
    </AdminScreen>
  );
}
