"""Promotion banners and Instagram stories drawn from templates, with the shop's own bottle photos.

No AI and nothing paid: Pillow draws the shop's fonts (Cormorant Garamond for the title, Manrope
for the rest, both under the SIL Open Font License, app/assets/fonts) and colours, and puts the
chosen products' photos on the picture. The photos are the catalog's own (normalized 600×600 on
white), so a bottle on a banner is always the real one.

Two formats: a banner 1200×800 (3:2, the home page's promotion card) and a story 1080×1920 (9:16).
Three themes: dark (ink, the bottles on a white stage), light (cream) and gold (soft gold); on the
light themes a bottle's white background melts into the picture (multiply).
"""

import io
import urllib.request
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

from PIL import Image, ImageChops, ImageDraw, ImageFont

from app.config import BASE_DIR, get_settings
from app.services import bottles, storage
from app.services.images import object_box, open_image

Format = Literal["banner", "story"]
Theme = Literal["dark", "light", "gold"]

SIZES: dict[str, tuple[int, int]] = {"banner": (1200, 800), "story": (1080, 1920)}
MAX_PRODUCTS = 3

FONTS = BASE_DIR / "app" / "assets" / "fonts"
SERIF = FONTS / "CormorantGaramond_700Bold.ttf"
SANS = FONTS / "Manrope_500Medium.ttf"
SANS_BOLD = FONTS / "Manrope_700Bold.ttf"

INK = (28, 25, 23)
CREAM = (250, 248, 245)
GOLD = (166, 124, 82)
GOLD_SOFT = (243, 235, 225)
WHITE = (255, 255, 255)
MUTED = (120, 113, 108)
STONE = (214, 211, 209)


@dataclass(frozen=True)
class Palette:
    background: tuple[int, int, int]
    title: tuple[int, int, int]
    text: tuple[int, int, int]
    accent: tuple[int, int, int]
    # The dark theme sets the bottles on a white stage; the light ones blend them in.
    stage: tuple[int, int, int] | None


PALETTES: dict[str, Palette] = {
    "dark": Palette(INK, WHITE, STONE, GOLD, WHITE),
    "light": Palette(CREAM, INK, MUTED, GOLD, None),
    "gold": Palette(GOLD_SOFT, INK, MUTED, GOLD, None),
}


@dataclass
class Spec:
    format: Format
    theme: Theme
    title: str
    subtitle: str | None = None
    # «−15%», «Хит», «Новинка»: a gold pill.
    badge: str | None = None
    # «до 30 ноября», «Только в декабре»: next to the badge.
    note: str | None = None


# ---------- Fonts ----------


@lru_cache(maxsize=64)
def _font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


@lru_cache(maxsize=512)
def _has_glyph(path: Path, char: str) -> bool:
    """Manrope has no tenge sign (₸): such characters are drawn with the serif instead."""
    font = _font(path, 40)
    return bytes(font.getmask(char)) != bytes(font.getmask(""))


def _runs(text: str, path: Path) -> list[tuple[str, Path]]:
    runs: list[tuple[str, Path]] = []
    for ch in text:
        p = path if ch.isspace() or _has_glyph(path, ch) else SERIF
        if runs and runs[-1][1] == p:
            runs[-1] = (runs[-1][0] + ch, p)
        else:
            runs.append((ch, p))
    return runs


def _width(text: str, path: Path, size: int) -> float:
    return sum(_font(p, size).getlength(run) for run, p in _runs(text, path))


def _draw(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    text: str,
    path: Path,
    size: int,
    fill: tuple[int, int, int],
) -> None:
    x, y = xy
    for run, p in _runs(text, path):
        font = _font(p, size)
        draw.text((x, y), run, font=font, fill=fill)
        x += font.getlength(run)


def _wrap(text: str, path: Path, size: int, width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.splitlines() or [""]:
        line = ""
        for word in paragraph.split():
            candidate = f"{line} {word}".strip()
            if line and _width(candidate, path, size) > width:
                lines.append(line)
                line = word
            else:
                line = candidate
        lines.append(line)
    return [line for line in lines if line] or [""]


def _fit(text: str, path: Path, width: int, sizes: range, max_lines: int) -> tuple[int, list[str]]:
    """The largest size at which the text takes no more than max_lines lines; else the smallest,
    cut to max_lines with an ellipsis."""
    for size in sizes:
        lines = _wrap(text, path, size, width)
        if len(lines) <= max_lines and all(_width(line, path, size) <= width for line in lines):
            return size, lines
    size = sizes[-1]
    lines = _wrap(text, path, size, width)[:max_lines]
    while lines and _width(lines[-1] + "…", path, size) > width:
        lines[-1] = lines[-1][:-1].rstrip()
    lines[-1] = lines[-1] + "…" if lines else "…"
    return size, lines


def _block(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    lines: list[str],
    path: Path,
    size: int,
    fill: tuple[int, int, int],
    leading: float,
) -> int:
    """Draws lines from y down; returns the y under the last line."""
    step = round(size * leading)
    for line in lines:
        _draw(draw, (x, y), line, path, size, fill)
        y += step
    return y


def _pill(draw: ImageDraw.ImageDraw, x: int, y: int, text: str, size: int, palette: Palette) -> int:
    """A gold pill with white text at (x, y); returns its right edge."""
    pad_x, pad_y = round(size * 0.6), round(size * 0.3)
    w = round(_width(text, SANS_BOLD, size)) + 2 * pad_x
    h = round(size * 1.25) + 2 * pad_y
    draw.rounded_rectangle((x, y, x + w, y + h), radius=h // 2, fill=palette.accent)
    _draw(draw, (x + pad_x, y + pad_y), text, SANS_BOLD, size, WHITE)
    return x + w


def _eyebrow(draw: ImageDraw.ImageDraw, x: int, y: int, size: int, palette: Palette) -> None:
    # Letter-spaced brand line, as the storefront's eyebrows.
    font = _font(SANS_BOLD, size)
    for ch in "KYKO":
        draw.text((x, y), ch, font=font, fill=palette.accent)
        x += font.getlength(ch) + size * 0.35


# ---------- Product photos ----------


def _photo_bytes(url: str) -> bytes | None:
    """A product photo, wherever the catalog keeps it: the bucket (or any https link), the media
    folder, or the bottles that came with the code."""
    s = get_settings()
    url = bottles.bucket_url(url) or url
    try:
        if url.startswith(("http://", "https://")):
            req = urllib.request.Request(url, headers={"User-Agent": "kyko-creatives"})
            with urllib.request.urlopen(req, timeout=15) as res:  # noqa: S310 (catalog URLs)
                return res.read()
        if url.startswith(s.media_url_prefix + "/"):
            return (s.media_dir / url[len(s.media_url_prefix) + 1 :]).read_bytes()
        if url.startswith(bottles.LOCAL_PREFIX):
            return (bottles.default_dir() / url[len(bottles.LOCAL_PREFIX) :]).read_bytes()
    except OSError:
        return None
    return None


def load_photo(url: str | None) -> Image.Image | None:
    if not url:
        return None
    data = _photo_bytes(url)
    if data is None:
        return None
    try:
        im = open_image(data)
    except Exception:  # noqa: BLE001 - a broken photo leaves its place empty
        return None
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        flat = Image.new("RGB", im.size, WHITE)
        flat.paste(im, mask=im.getchannel("A"))
        im = flat
    return im.convert("RGB")


def _trim(photo: Image.Image) -> Image.Image:
    """The bottle without the white square around it (a little margin kept), so bottles of any
    photo fill the space by their own size."""
    box = object_box(photo, WHITE)
    if not box:
        return photo
    x0, y0, x1, y1 = box
    pad = round(max(x1 - x0, y1 - y0) * 0.03)
    return photo.crop(
        (
            max(0, x0 - pad),
            max(0, y0 - pad),
            min(photo.width, x1 + pad),
            min(photo.height, y1 + pad),
        )
    )


def _paste(canvas: Image.Image, photo: Image.Image, x: int, y: int, blend: bool) -> None:
    """On a light picture the photo's white background melts into it (multiply); on the dark
    theme it sits on the white stage."""
    region = (x, y, x + photo.width, y + photo.height)
    if blend:
        canvas.paste(ImageChops.multiply(canvas.crop(region), photo), region)
    else:
        canvas.paste(photo, region)


Placed = list[tuple[Image.Image, int, int]]


def _layout(photos: list[Image.Image], area: tuple[int, int, int, int]) -> Placed:
    """The bottles side by side on the area's bottom line, as tall as the area allows: with
    three, the middle one in front and the side ones a little smaller."""
    if not photos:
        return []
    x0, y0, x1, y1 = area
    w, h = x1 - x0, y1 - y0
    crops = [_trim(p) for p in photos]
    factors = [0.82, 1.0, 0.82] if len(crops) == 3 else [1.0] * len(crops)
    gap = round(w * 0.04)
    sizes = [(c.width * h * f / c.height, h * f) for c, f in zip(crops, factors, strict=True)]
    total = sum(sw for sw, _ in sizes) + gap * (len(sizes) - 1)
    scale = min(1.0, w / total) if total else 1.0
    x = x0 + (w - total * scale) / 2
    placed: Placed = []
    for crop, (sw, sh) in zip(crops, sizes, strict=True):
        cw, ch = max(1, round(sw * scale)), max(1, round(sh * scale))
        placed.append((crop.resize((cw, ch), Image.Resampling.LANCZOS), round(x), y1 - ch))
        x += cw + gap * scale
    return placed


def _stage(
    canvas: Image.Image,
    photos: list[Image.Image],
    area: tuple[int, int, int, int],
    pal: Palette,
    pad: int,
    radius: int,
) -> None:
    """The bottles in the area. On the dark theme they stand on a white stage that is only as
    tall as they are; on the light ones they melt into the picture."""
    placed = _layout(photos, area)
    if not placed:
        return
    if pal.stage:
        top = min(y for _, _, y in placed)
        x0, _, x1, y1 = area
        ImageDraw.Draw(canvas).rounded_rectangle(
            (x0 - pad, top - pad, x1 + pad, y1 + pad), radius=radius, fill=pal.stage
        )
    for im, x, y in placed:
        _paste(canvas, im, x, y, blend=pal.stage is None)


# ---------- Layouts ----------


def _banner(spec: Spec, photos: list[Image.Image]) -> Image.Image:
    W, H = SIZES["banner"]
    pal = PALETTES[spec.theme]
    im = Image.new("RGB", (W, H), pal.background)
    d = ImageDraw.Draw(im)
    m = 64
    text_w = 540 if photos else W - 2 * m

    if photos:
        _stage(im, photos, (668, m + 28, W - m - 28, H - m - 28), pal, pad=28, radius=36)

    _eyebrow(d, m, m, 22, pal)
    y = m + 64
    size, lines = _fit(spec.title, SERIF, text_w, range(92, 47, -4), 3)
    y = _block(d, m, y, lines, SERIF, size, pal.title, 1.02) + 16
    if spec.subtitle:
        sub_size, sub = _fit(spec.subtitle, SANS, text_w, range(30, 21, -2), 3)
        _block(d, m, y, sub, SANS, sub_size, pal.text, 1.35)

    bottom = H - m
    x = m
    if spec.badge:
        x = _pill(d, m, bottom - 74, spec.badge, 40, pal) + 20
    if spec.note:
        room = (600 if photos else W - m) - x
        note_size, note = _fit(spec.note, SANS_BOLD, room, range(26, 17, -2), 1)
        top = bottom - 74 + (74 - note_size * 1.3) / 2
        _draw(d, (x, top), note[0], SANS_BOLD, note_size, pal.title)
    return im


def _story(spec: Spec, photos: list[Image.Image]) -> Image.Image:
    W, H = SIZES["story"]
    pal = PALETTES[spec.theme]
    im = Image.new("RGB", (W, H), pal.background)
    d = ImageDraw.Draw(im)
    m = 80
    text_w = W - 2 * m

    # Without bottles the text stands in the middle of the picture, not at its top.
    top = 150 if photos else 560
    _eyebrow(d, m, top, 30, pal)
    y = top + 100
    size, lines = _fit(spec.title, SERIF, text_w, range(132, 71, -4), 4)
    y = _block(d, m, y, lines, SERIF, size, pal.title, 1.0) + 24
    if spec.subtitle:
        sub_size, sub = _fit(spec.subtitle, SANS, text_w, range(42, 29, -2), 4)
        y = _block(d, m, y, sub, SANS, sub_size, pal.text, 1.35)

    if photos:
        top = max(y + 100, 900)
        _stage(im, photos, (m + 32, top, W - m - 32, 1600), pal, pad=48, radius=48)

    bottom = 1720
    x = m
    if spec.badge:
        x = _pill(d, m, bottom, spec.badge, 52, pal) + 24
    if spec.note:
        note_size, note = _fit(spec.note, SANS_BOLD, W - m - x, range(36, 23, -2), 1)
        top = bottom + (96 - note_size * 1.3) / 2
        _draw(d, (x, top), note[0], SANS_BOLD, note_size, pal.title)
    return im


def render(spec: Spec, photos: list[Image.Image]) -> Image.Image:
    photos = photos[:MAX_PRODUCTS]
    return _banner(spec, photos) if spec.format == "banner" else _story(spec, photos)


def jpeg(im: Image.Image, quality: int = 90) -> bytes:
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


def save(data: bytes, key: str) -> str:
    return storage.save(key, data, "image/jpeg")
