"""Writing spreadsheets the owner opens in Excel or LibreOffice."""

import io

from openpyxl import Workbook


def to_bytes(wb: Workbook) -> bytes:
    """The workbook as .xlsx, with every cell that looks like a formula kept as plain text.

    openpyxl stores a string starting with «=» as a live formula. Names, addresses and comments
    typed by customers and lines from suppliers' files end up in these files, so
    «=HYPERLINK("https://…","Подтвердить")» in a guest's name must stay text, not become a link
    (or worse) in the owner's spreadsheet. The shop's own files have no formulas.
    """
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for cell in row:
                if cell.data_type == "f":
                    cell.data_type = "s"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
