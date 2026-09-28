"""Delivery note (накладная) of an order as an Excel file, printed and put in the parcel.

The printable page with the same content (for PDF) is /admin/orders/<id>/invoice in the frontend.
"""

import io
from datetime import datetime
from zoneinfo import ZoneInfo

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, Side
from openpyxl.utils import get_column_letter

from app.config import get_settings
from app.models import Order, OrderChannel, volume_label

SHOP_NAME = "Kyko Parfum"
PAYMENT_LABELS = {
    "cash": "Наличные",
    "card": "Карта",
    "transfer": "Kaspi / перевод",
    "other": "Другое",
}


def invoice_filename(order: Order) -> str:
    return f"nakladnaya_{order.id}.xlsx"


def _local(dt: datetime) -> datetime:
    return dt.astimezone(ZoneInfo(get_settings().timezone))


def build_invoice(order: Order) -> bytes:
    """Lines removed before delivery (quantity 0) are left out; returns don't change the note."""
    settings = get_settings()
    money_fmt = f'#,##0 "{settings.currency_sign}"'
    thin = Side(style="thin", color="999999")
    box = Border(left=thin, right=thin, top=thin, bottom=thin)
    bold = Font(bold=True)

    wb = Workbook()
    ws = wb.active
    ws.title = f"Накладная {order.id}"

    ws.append([f"Накладная № {order.id} от {_local(order.created_at):%d.%m.%Y}"])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([])
    info = [
        ("Продавец", SHOP_NAME),
        (
            "Покупатель",
            order.contact_name
            or ("Покупатель в магазине" if order.channel == OrderChannel.store else ""),
        ),
        ("Телефон", order.contact_phone),
        ("Email", order.contact_email),
        (
            "Адрес доставки",
            ", ".join(p for p in (order.delivery_city, order.delivery_address) if p),
        ),
        (
            "Оплата",
            PAYMENT_LABELS.get(order.payment_method.value) if order.payment_method else None,
        ),
        ("Комментарий", order.comment),
    ]
    for label, value in info:
        if value:
            ws.append([label, value])
            ws.cell(ws.max_row, 1).font = bold
    ws.append([])

    header = ["№", "Бренд", "Товар", "Объём", "Артикул", "Кол-во", "Цена", "Сумма"]
    ws.append(header)
    head_row = ws.max_row
    for col in range(1, len(header) + 1):
        c = ws.cell(head_row, col)
        c.font = bold
        c.border = box
        c.alignment = Alignment(horizontal="center", vertical="center")

    lines = [i for i in order.items if i.quantity > 0]
    for n, item in enumerate(lines, 1):
        ws.append(
            [
                n,
                item.brand_name,
                item.product_name,
                volume_label(item.volume_ml, item.is_tester),
                item.variant.sku if item.variant else None,
                item.quantity,
                float(item.price_applied),
                float(item.line_total),
            ]
        )
        row = ws.max_row
        for col in range(1, len(header) + 1):
            ws.cell(row, col).border = box
        ws.cell(row, 7).number_format = money_fmt
        ws.cell(row, 8).number_format = money_fmt

    total_row = ws.max_row + 1
    ws.cell(total_row, 5, "Итого").font = bold
    ws.cell(total_row, 6, sum(i.quantity for i in lines)).font = bold
    total = ws.cell(total_row, 8, float(sum(i.line_total for i in lines)))
    total.font = bold
    total.number_format = money_fmt

    ws.append([])
    ws.append([])
    ws.append(["Отпустил: ____________________", None, None, "Получил: ____________________"])

    for col, width in enumerate([5, 18, 34, 16, 16, 9, 13, 14], 1):
        ws.column_dimensions[get_column_letter(col)].width = width
    ws.page_setup.orientation = "portrait"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
