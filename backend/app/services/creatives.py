"""Promotion banners and Instagram stories drawn from templates, with the shop's own bottle photos.

No AI and nothing paid: Pillow draws the shop's fonts (Cormorant Garamond for the title, Manrope
for the rest, both under the SIL Open Font License, app/assets/fonts) and colours, and puts the
chosen products' photos on the picture. The photos are the catalog's own (normalized 600×600 on
white), so a bottle on a banner is always the real one.

Two formats: a banner 1200×800 (3:2, the home page's promotion card) and a story 1080×1920 (9:16).
Four themes: jewel («Шкатулка», the shop's style: velvet into cherry, the title in Cormorant
italic, KYKO with a pearl, the bottles on a studio backdrop), dark (ink, the bottles on a white
stage), light (cream) and gold (soft gold); on the light themes and the studio backdrop a bottle's
white background melts into the picture (multiply).
"""

import io
import ipaddress
import socket
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

from app.config import BASE_DIR, get_settings
from app.services import bottles, storage
from app.services.images import object_box, open_image

Format = Literal["banner", "story"]
Theme = Literal["jewel", "dark", "light", "gold"]

SIZES: dict[str, tuple[int, int]] = {"banner": (1200, 800), "story": (1080, 1920)}
MAX_PRODUCTS = 3

FONTS = BASE_DIR / "app" / "assets" / "fonts"
SERIF = FONTS / "CormorantGaramond_700Bold.ttf"
SERIF_ITALIC = FONTS / "CormorantGaramond_500Medium_Italic.ttf"
SANS = FONTS / "Manrope_500Medium.ttf"
SANS_BOLD = FONTS / "Manrope_700Bold.ttf"

INK = (28, 25, 23)
CREAM = (250, 248, 245)
GOLD = (166, 124, 82)
GOLD_SOFT = (243, 235, 225)
WHITE = (255, 255, 255)
MUTED = (120, 113, 108)
STONE = (214, 211, 209)
# «Шкатулка»: velvet, cherry, a lighter cherry, pearl, mother-of-pearl.
VELVET = (42, 7, 14)
CHERRY = (92, 16, 32)
CHERRY_LIGHT = (122, 33, 54)
PEARL = (244, 237, 228)
NACRE = (233, 201, 190)
NACRE_MUTED = (224, 188, 194)
STUDIO = (241, 223, 217)


@dataclass(frozen=True)
class Palette:
    background: tuple[int, int, int]
    title: tuple[int, int, int]
    text: tuple[int, int, int]
    accent: tuple[int, int, int]
    # The dark theme sets the bottles on a white stage; the light ones blend them in.
    stage: tuple[int, int, int] | None
    pill_text: tuple[int, int, int] = WHITE
    title_font: Path = SERIF
    # «Шкатулка»: the background runs from velvet into cherry, KYKO's O is a pearl, and the
    # bottles stand on a studio backdrop (white into mother-of-pearl) that they melt into.
    jewel: bool = False


PALETTES: dict[str, Palette] = {
    "jewel": Palette(
        VELVET, PEARL, NACRE_MUTED, NACRE, None, CHERRY, title_font=SERIF_ITALIC, jewel=True
    ),
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
    radius = h // 2 if not palette.jewel else round(size * 0.15)
    draw.rounded_rectangle((x, y, x + w, y + h), radius=radius, fill=palette.accent)
    _draw(draw, (x + pad_x, y + pad_y), text, SANS_BOLD, size, palette.pill_text)
    return x + w


def _pearl(canvas: Image.Image, cx: float, cy: float, r: float) -> None:
    """The brand's pearl: a warm rim into mother-of-pearl into a white highlight at the top
    left, drawn as rings at four times the size and scaled down so its edge is smooth."""
    k = 4
    d = max(2, round(2 * r * k))
    pearl = Image.new("RGB", (d, d), NACRE)
    draw = ImageDraw.Draw(pearl)
    rim, mid, light = (214, 180, 167), (243, 230, 222), (255, 255, 255)
    steps = max(8, d // 4)
    for i in range(steps):
        t = i / (steps - 1)
        a, b, u = (rim, mid, t / 0.6) if t < 0.6 else (mid, light, (t - 0.6) / 0.4)
        color = tuple(round(a[j] + (b[j] - a[j]) * u) for j in range(3))
        rr = d / 2 * (1 - t * 0.92)
        # The rings drift towards the highlight as they shrink.
        ox, oy = d / 2 - (d * 0.16) * t, d / 2 - (d * 0.2) * t
        draw.ellipse((ox - rr, oy - rr, ox + rr, oy + rr), fill=color)
    mask = Image.new("L", (d, d), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, d - 1, d - 1), fill=255)
    size = round(2 * r)
    pearl = pearl.resize((size, size), Image.Resampling.LANCZOS)
    mask = mask.resize((size, size), Image.Resampling.LANCZOS)
    canvas.paste(pearl, (round(cx - r), round(cy - r)), mask)


def _eyebrow(
    draw: ImageDraw.ImageDraw, x: int, y: int, size: int, palette: Palette, canvas: Image.Image
) -> None:
    # Letter-spaced brand line, as the storefront's eyebrows; on «Шкатулка» the O is a pearl.
    font = _font(SANS_BOLD, size)
    for ch in "KYKO":
        if ch == "O" and palette.jewel:
            r = size * 0.42
            _pearl(canvas, x + r, y + size * 0.62, r)
            break
        draw.text((x, y), ch, font=font, fill=palette.accent)
        x += font.getlength(ch) + size * 0.35


def _canvas(size: tuple[int, int], pal: Palette) -> Image.Image:
    """The picture's ground: one colour, or on «Шкатулка» velvet into cherry from the top left,
    with a soft glow of lighter cherry at the right."""
    if not pal.jewel:
        return Image.new("RGB", size, pal.background)
    W, H = size
    # A diagonal ramp: the mean of a top-to-bottom and a left-to-right one (no rotated edges).
    down = Image.linear_gradient("L").resize((W, H))
    across = Image.linear_gradient("L").rotate(90).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    ramp = Image.blend(down, across.resize((W, H)), 0.5)
    im = Image.composite(Image.new("RGB", size, CHERRY), Image.new("RGB", size, VELVET), ramp)
    glow = Image.new("L", size, 0)
    ImageDraw.Draw(glow).ellipse((W * 0.45, -H * 0.3, W * 1.35, H * 0.9), fill=110)
    glow = glow.filter(ImageFilter.GaussianBlur(min(W, H) // 5))
    return Image.composite(Image.new("RGB", size, CHERRY_LIGHT), im, glow)


# ---------- Product photos ----------


# A product photo is read up to this size: a link to something huge leaves its place empty.
MAX_PHOTO_BYTES = 15 * 1024 * 1024


def _public_host(host: str | None) -> bool:
    """Whether a host is on the internet: product links come from files too (supplier lists
    turned into an import), and must not make the server fetch its own or the local network's
    addresses."""
    if not host:
        return False
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(host, 443)}
    except OSError:
        return False
    return all(ipaddress.ip_address(a.split("%")[0]).is_global for a in addresses)


class _PublicRedirects(urllib.request.HTTPRedirectHandler):
    """Follows a redirect only to another public https address: a photo link must not bounce
    the server to its own or the local network's addresses (or to plain http)."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: PLR0913
        parts = urllib.parse.urlsplit(newurl)
        if parts.scheme != "https" or not _public_host(parts.hostname):
            raise urllib.error.HTTPError(newurl, code, "redirect refused", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_PUBLIC_OPENER = urllib.request.build_opener(_PublicRedirects)


def _inside(base: Path, relative: str) -> Path | None:
    """``base / relative`` if it stays inside ``base`` (no «..» out of the folder)."""
    path = (base / relative).resolve()
    return path if path.is_relative_to(base.resolve()) else None


def _photo_bytes(url: str) -> bytes | None:
    """A product photo, wherever the catalog keeps it: the bucket (or any https link), the media
    folder, or the bottles that came with the code."""
    s = get_settings()
    url = bottles.bucket_url(url) or url
    try:
        if url.startswith("https://"):
            if not _public_host(urllib.parse.urlsplit(url).hostname):
                return None
            req = urllib.request.Request(url, headers={"User-Agent": "kyko-creatives"})
            with _PUBLIC_OPENER.open(req, timeout=15) as res:  # noqa: S310 (checked above)
                data = res.read(MAX_PHOTO_BYTES + 1)
            return data if len(data) <= MAX_PHOTO_BYTES else None
        if url.startswith(s.media_url_prefix + "/"):
            path = _inside(s.media_dir, url[len(s.media_url_prefix) + 1 :])
            return path.read_bytes() if path else None
        if url.startswith(bottles.LOCAL_PREFIX):
            path = _inside(bottles.default_dir(), url[len(bottles.LOCAL_PREFIX) :])
            return path.read_bytes() if path else None
    except (OSError, ValueError):
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
    if pal.jewel:
        # The studio backdrop: white into mother-of-pearl, the bottles melted into it.
        top = min(y for _, _, y in placed)
        x0, _, x1, y1 = area
        box = (x0 - pad, top - pad, x1 + pad, y1 + pad)
        w, h = box[2] - box[0], box[3] - box[1]
        paper = Image.composite(
            Image.new("RGB", (w, h), STUDIO),
            Image.new("RGB", (w, h), WHITE),
            Image.linear_gradient("L").resize((w, h)),
        )
        mask = Image.new("L", (w, h), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)
        canvas.paste(paper, box[:2], mask)
        for im, x, y in placed:
            _paste(canvas, im, x, y, blend=True)
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
    im = _canvas((W, H), pal)
    d = ImageDraw.Draw(im)
    m = 64
    text_w = 540 if photos else W - 2 * m

    if photos:
        _stage(im, photos, (668, m + 28, W - m - 28, H - m - 28), pal, pad=28, radius=36)

    _eyebrow(d, m, m, 22, pal, im)
    y = m + 64
    size, lines = _fit(spec.title, pal.title_font, text_w, range(92, 47, -4), 3)
    y = _block(d, m, y, lines, pal.title_font, size, pal.title, 1.02) + 16
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
    im = _canvas((W, H), pal)
    d = ImageDraw.Draw(im)
    m = 80
    text_w = W - 2 * m

    # Without bottles the text stands in the middle of the picture, not at its top.
    top = 150 if photos else 560
    _eyebrow(d, m, top, 30, pal, im)
    y = top + 100
    size, lines = _fit(spec.title, pal.title_font, text_w, range(132, 71, -4), 4)
    y = _block(d, m, y, lines, pal.title_font, size, pal.title, 1.0) + 24
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
