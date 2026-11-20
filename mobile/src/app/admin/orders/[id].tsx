import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { AdminScreen, Block, KV, Pill, confirm } from "@/components/admin/kit";
import { EditItemsPanel, PickingPanel, ReturnPanel } from "@/components/admin/order-panels";
import { StatusBadge } from "@/components/shop";
import { Button, Divider, ErrorState, Field, Loader, Muted, Notice, Txt } from "@/components/ui";
import type { AdminOrder } from "@/lib/admin-types";
import { api, errorText } from "@/lib/api";
import { XLSX, saveAndShare } from "@/lib/files";
import {
  PAYMENT_LABELS,
  ROLE_LABELS,
  STATUS_LABELS,
  dateTime,
  percentOff,
  tenge,
  volumeLabel,
} from "@/lib/format";
import { useApi } from "@/lib/queries";
import type { OrderStatus } from "@/lib/types";
import { colors, fonts } from "@/theme";

// Mirrors backend TRANSITIONS (app/services/orders.py), as on the website.
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  new: ["processing", "shipped", "cancelled"],
  processing: ["new", "shipped", "cancelled"],
  shipped: ["processing", "delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export default function AdminOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <AdminScreen title={`Заказ № ${id}`} area="orders">
      <OrderAdmin id={Number(id)} />
    </AdminScreen>
  );
}

function OrderAdmin({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const order = useApi<AdminOrder>(`/admin/orders/${id}`);
  const [note, setNote] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<"edit" | "return" | "pick" | null>(null);

  if (order.error && !order.data) {
    return <ErrorState message={order.error.message} onRetry={() => void order.refetch()} />;
  }
  if (!order.data) return <Loader />;
  const o = order.data;

  const refresh = (updated?: AdminOrder) => {
    if (updated) queryClient.setQueryData([`/admin/orders/${id}`, null], updated);
    else void order.refetch();
    void queryClient.invalidateQueries({ queryKey: ["/admin/orders"] });
    void queryClient.invalidateQueries({ queryKey: ["/admin/stats"] });
  };
  const patch = async (body: Record<string, unknown>, okText: string) => {
    setBusy(true);
    setMsg(null);
    try {
      refresh(await api<AdminOrder>(`/admin/orders/${id}`, { method: "PATCH", body }));
      setMsg({ ok: true, text: okText });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };
  const changeStatus = async (s: OrderStatus) => {
    if (
      s === "cancelled" &&
      !(await confirm("Отменить заказ?", "Товары вернутся на склад.", "Отменить"))
    ) {
      return;
    }
    await patch({ status: s }, s === "cancelled" ? "Заказ отменён" : `Статус: ${STATUS_LABELS[s]}`);
  };
  const panelDone = (text: string) => (updated: AdminOrder) => {
    setPanel(null);
    refresh(updated);
    setMsg({ ok: true, text });
  };

  const isStore = o.channel === "store";
  const open = o.status === "new" || o.status === "processing";
  const canPick = !isStore && open;
  const canReturn = o.status === "delivered" && !o.fully_returned;
  const backordered = open && o.items.some((i) => (i.backordered ?? 0) > 0 && i.quantity > 0);

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 14 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={order.isRefetching}
          onRefresh={() => void order.refetch()}
          tintColor={colors.gold}
        />
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <StatusBadge status={o.status} />
        <Pill
          tone={isStore ? "gold" : "muted"}
          label={`${isStore ? "Магазин" : "Сайт"}${o.payment_method ? ` · ${PAYMENT_LABELS[o.payment_method]}` : ""}`}
        />
        {o.fully_returned && <Pill tone="danger" label="Возвращён полностью" />}
        <Muted style={{ fontSize: 12, marginLeft: "auto" }}>{dateTime(o.created_at)}</Muted>
      </View>
      <Txt style={{ fontFamily: fonts.sansBold, fontSize: 28 }} testID="admin-order-total">
        {tenge(o.net_total)}
      </Txt>

      <Block title={isStore && o.status === "delivered" ? "Товар выдан" : "Статус"}>
        {NEXT[o.status].length === 0 ? (
          <Muted>Заказ в финальном статусе.</Muted>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {NEXT[o.status].map((s) => (
              <Button
                key={s}
                small
                kind={s === "cancelled" ? "danger" : "outline"}
                title={STATUS_LABELS[s]}
                disabled={busy}
                testID={`status-${s}`}
                onPress={() => void changeStatus(s)}
              />
            ))}
          </View>
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {canPick && (
            <Button
              small
              icon="scan-outline"
              title="Собрать заказ"
              onPress={() => setPanel("pick")}
            />
          )}
          {open && (
            <Button small kind="gold" title="Изменить состав" onPress={() => setPanel("edit")} />
          )}
          {canReturn && (
            <Button
              small
              kind="danger"
              title="Оформить возврат"
              onPress={() => setPanel("return")}
            />
          )}
          <Button
            small
            kind="outline"
            icon="share-outline"
            title="Накладная Excel"
            onPress={() =>
              void saveAndShare(
                `/admin/orders/${o.id}/invoice.xlsx`,
                `nakladnaya_${o.id}.xlsx`,
                XLSX,
              ).catch((err: unknown) => setMsg({ ok: false, text: errorText(err) }))
            }
          />
        </View>
      </Block>

      {msg && <Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice>}

      {panel === "pick" && (
        <PickingPanel
          order={o}
          canShip={NEXT[o.status].includes("shipped")}
          onShip={() => {
            setPanel(null);
            void patch({ status: "shipped" }, "Заказ собран. Статус: Отправлен");
          }}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "edit" && (
        <EditItemsPanel
          order={o}
          onDone={panelDone("Состав заказа изменён")}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "return" && (
        <ReturnPanel
          order={o}
          onDone={panelDone("Возврат оформлен")}
          onClose={() => setPanel(null)}
        />
      )}

      {backordered && (
        <Notice tone="warn">
          Часть товара под заказ: при оформлении её не было на складе. Закажите у поставщика и
          проведите приёмку, или уберите недостающее через «Изменить состав».
        </Notice>
      )}

      <Block title="Состав">
        {o.items.map((i, n) => {
          const stock = i.variant_id !== null ? o.variant_stock[i.variant_id] : undefined;
          return (
            <View key={i.id} style={{ gap: 2 }}>
              {n > 0 && <Divider style={{ marginBottom: 8 }} />}
              <Txt style={{ fontFamily: fonts.sansSemi, fontSize: 14 }}>
                {i.brand_name} {i.product_name}, {volumeLabel(i.volume_ml, i.is_tester)}
              </Txt>
              <KV
                label={`${tenge(i.price_applied)} × ${i.quantity}${
                  i.quantity !== i.original_quantity ? ` (было ${i.original_quantity})` : ""
                }`}
                value={tenge(i.line_total)}
                strong
              />
              {(i.promotion_title || i.discount_percent > 0) && (
                <Txt style={{ fontSize: 12, color: colors.gold }}>
                  {i.promotion_title
                    ? `Акция «${i.promotion_title}»`
                    : `Скидка ${percentOff(i.discount_percent)}`}
                </Txt>
              )}
              {(i.backordered ?? 0) > 0 && open && (
                <Txt style={{ fontSize: 12, color: colors.warn }}>
                  Под заказ: {i.backordered} шт.
                </Txt>
              )}
              {i.returned_quantity > 0 && (
                <Muted style={{ fontSize: 12 }}>Возвращено: {i.returned_quantity} шт.</Muted>
              )}
              {stock !== undefined && (
                <Muted style={{ fontSize: 12 }}>На складе сейчас: {stock}</Muted>
              )}
            </View>
          );
        })}
        <Divider />
        {o.discount_total > 0 && (
          <KV label="Скидка" value={`−${tenge(o.discount_total)}`} color={colors.ok} />
        )}
        {o.returned_amount > 0 && (
          <KV label="Возвращено" value={`−${tenge(o.returned_amount)}`} color={colors.danger} />
        )}
        <KV label="Итого" value={tenge(o.net_total)} strong />
      </Block>

      {o.returns.length > 0 && (
        <Block title="Возвраты">
          {o.returns.map((r) => (
            <View key={r.id} style={{ gap: 2 }}>
              <KV label={dateTime(r.created_at)} value={`−${tenge(r.refund_amount)}`} strong />
              {r.items.map((it) => (
                <Muted key={it.order_item_id} style={{ fontSize: 12 }}>
                  {it.product_label} × {it.quantity} · {it.restock ? "на склад" : "списано"}
                </Muted>
              ))}
              {r.reason && <Muted style={{ fontSize: 12 }}>Причина: {r.reason}</Muted>}
            </View>
          ))}
        </Block>
      )}

      <Block title="Покупатель">
        {o.contact_name || o.contact_phone || o.contact_email ? (
          <>
            {o.contact_name && <Txt style={{ fontFamily: fonts.sansSemi }}>{o.contact_name}</Txt>}
            {o.contact_phone && <Txt>{o.contact_phone}</Txt>}
            {o.contact_email && <Txt>{o.contact_email}</Txt>}
          </>
        ) : (
          <Muted>Анонимный покупатель</Muted>
        )}
        {o.channel === "online" && !o.user_email && (
          <Muted style={{ fontSize: 12 }}>Без регистрации · розничные цены</Muted>
        )}
        {o.user_email && (
          <>
            <Muted style={{ fontSize: 12 }}>
              Аккаунт: {o.user_email} · {ROLE_LABELS[o.customer_role]} на момент заказа
            </Muted>
            <Button
              small
              kind="ghost"
              title="Открыть пользователя"
              style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}
              onPress={() =>
                router.push({ pathname: "/admin/users", params: { q: o.user_email ?? "" } })
              }
            />
          </>
        )}
      </Block>

      <Block title={isStore ? "Продажа" : "Доставка"}>
        {isStore ? (
          <>
            <Txt>Продано в магазине</Txt>
            {o.created_by_email && (
              <Muted style={{ fontSize: 13 }}>Провёл: {o.created_by_email}</Muted>
            )}
          </>
        ) : (
          <Txt>{[o.delivery_city, o.delivery_address].filter(Boolean).join(", ")}</Txt>
        )}
        {o.comment && <Muted style={{ fontSize: 13 }}>Комментарий: «{o.comment}»</Muted>}
        <Muted style={{ fontSize: 12 }}>
          Создан {dateTime(o.created_at)} · обновлён {dateTime(o.updated_at)}
        </Muted>
      </Block>

      <Block title="История">
        {[...o.events].reverse().map((e, n) => (
          <View key={n}>
            <Txt style={{ fontSize: 14 }}>{e.message}</Txt>
            <Muted style={{ fontSize: 12 }}>{dateTime(e.created_at)}</Muted>
          </View>
        ))}
      </Block>

      <Block title="Заметка менеджера">
        <Field
          label="Видна только сотрудникам"
          multiline
          value={note ?? o.admin_note ?? ""}
          onChangeText={setNote}
        />
        <Button
          small
          kind="outline"
          title="Сохранить заметку"
          disabled={busy || note === null}
          onPress={() => {
            void patch({ admin_note: note?.trim() || null }, "Заметка сохранена").then(() =>
              setNote(null),
            );
          }}
          style={{ alignSelf: "flex-start" }}
        />
      </Block>
    </ScrollView>
  );
}
