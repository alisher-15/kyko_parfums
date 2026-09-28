"""Product photos in one format: the bottle centred on a white square, always at the same scale.

Used by the admin upload (every product photo is processed when it is uploaded) and by
scripts/normalize_photos.py for the photos in frontend/public/bottles.

For a photo on a plain background:

1. the background colour is taken from the corners;
2. the empty background around the bottle is cropped;
3. the bottle is scaled so its longer side takes the same share of the frame (1 - 2 × margin);
4. it is centred on a square canvas of the background colour.

Light backgrounds become pure white (the catalog cards are white). A pure black background is
usually a lost transparency (a PNG saved as JPEG) and is painted white from the edges; black bars
around a light photo go the same way. A photo whose corners differ (a table, an interior, a
gradient) can't be cut out this way and is left as it is.
"""

import io
import statistics
from dataclasses import dataclass

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps, UnidentifiedImageError

# Written into every normalized file; such files are skipped next time.
MARKER = "kyko:normalized"
# Difference from the background (0-255) that counts as "bottle", above JPEG noise.
THRESHOLD = 24
# Corners that differ more than this are not a plain background.
MAX_CORNER_SPREAD = 20
# Backgrounds at least this light are turned pure white.
WHITE_ENOUGH = 215
# Pure black backgrounds are usually a lost transparency (PNG saved as JPEG): they become white.
NEAR_BLACK = 16

PHOTO_SIZE = 600
PHOTO_MARGIN = 0.07
JPEG_QUALITY = 85
# Banners and logos are not cropped, only made smaller than this (longer side, px).
MAX_OTHER_SIDE = 1600

SKIP_REASONS = {
    "uneven background": "фон неоднородный (стол, тень, интерьер) — фото загружено как есть",
    "no object found": "на фото не найден товар — фото загружено как есть",
}


def corner_colour(im: Image.Image) -> tuple[tuple[int, int, int], int]:
    """Median colour of the four corners and how much the corners differ."""
    w, h = im.size
    k = max(2, min(w, h) // 40)
    boxes = [(0, 0, k, k), (w - k, 0, w, k), (0, h - k, k, h), (w - k, h - k, w, h)]
    corners = [im.crop(b).resize((1, 1), Image.Resampling.BOX).getpixel((0, 0)) for b in boxes]
    colour = tuple(int(statistics.median(c[i] for c in corners)) for i in range(3))
    spread = max(max(c[i] for c in corners) - min(c[i] for c in corners) for i in range(3))
    return colour, spread


def object_box(im: Image.Image, bg: tuple[int, int, int]) -> tuple[int, int, int, int] | None:
    """Bounding box of everything that is not background, ignoring isolated JPEG specks."""
    diff = ImageChops.difference(im, Image.new("RGB", im.size, bg)).convert("L")
    mask = diff.point(lambda v: 255 if v > THRESHOLD else 0).filter(ImageFilter.MinFilter(3))
    return mask.getbbox()


def whiten(im: Image.Image, bg: tuple[int, int, int]) -> Image.Image:
    """Stretch each channel so the light background becomes exactly 255."""
    luts = [[min(255, round(v * 255 / max(c, 1))) for v in range(256)] for c in bg]
    return im.point(luts[0] + luts[1] + luts[2])


def black_to_white(im: Image.Image) -> Image.Image:
    """Paint the black background white, starting from the edges of the picture.

    Only black connected to the border is filled, so dark parts of the bottle (a black cap,
    a dark label) that are separated from the background by its outline stay as they are.
    """
    im = im.copy()
    w, h = im.size
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    seeds += [(w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    for xy in seeds:
        if max(im.getpixel(xy)) <= NEAR_BLACK:
            ImageDraw.floodfill(im, xy, (255, 255, 255), thresh=NEAR_BLACK)
    return im


def is_marked(im: Image.Image) -> bool:
    comment = im.info.get("comment", b"")
    if isinstance(comment, bytes):
        comment = comment.decode("latin-1")
    return comment == MARKER or im.info.get("kyko") == MARKER


def flatten(im: Image.Image) -> Image.Image:
    """RGB with transparency made white (a PNG cut-out of a bottle keeps its shape)."""
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        canvas = Image.new("RGB", im.size, (255, 255, 255))
        canvas.paste(im, mask=im.getchannel("A"))
        return canvas
    return im.convert("RGB")


def normalize(
    im: Image.Image, size: int = PHOTO_SIZE, margin: float = PHOTO_MARGIN
) -> tuple[Image.Image | None, str]:
    """The normalized picture, or None with the reason it was left as is."""
    if is_marked(im):
        return None, "already normalized"
    im = flatten(im)
    bg, spread = corner_colour(im)
    if spread > MAX_CORNER_SPREAD:
        return None, "uneven background"
    if max(bg) <= NEAR_BLACK:
        im, bg = black_to_white(im), (255, 255, 255)
        box = object_box(im, bg)
        if box is None:
            return None, "no object found"
        # A light photo inside black bars: once the bars are gone, whiten its own background too.
        inner = im.crop(box)
        inner_bg, inner_spread = corner_colour(inner)
        if inner_spread <= MAX_CORNER_SPREAD and WHITE_ENOUGH <= min(inner_bg) < 250:
            return normalize(inner, size, margin)
    box = object_box(im, bg)
    if box is None:
        return None, "no object found"
    if min(bg) >= WHITE_ENOUGH:
        im, bg = whiten(im, bg), (255, 255, 255)

    bottle = im.crop(box)
    target = size * (1 - 2 * margin)
    scale = target / max(bottle.size)
    new_size = (max(1, round(bottle.width * scale)), max(1, round(bottle.height * scale)))

    bottle = bottle.resize(new_size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (size, size), bg)
    canvas.paste(bottle, ((size - new_size[0]) // 2, (size - new_size[1]) // 2))
    return canvas, "normalized"


def jpeg_bytes(im: Image.Image, *, marked: bool) -> bytes:
    buf = io.BytesIO()
    extra = {"comment": MARKER} if marked else {}
    im.save(buf, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True, **extra)
    return buf.getvalue()


class NotAnImage(ValueError):
    pass


@dataclass
class Prepared:
    data: bytes
    ext: str
    content_type: str
    normalized: bool
    # Why a product photo was not normalized (shown to the admin), None otherwise.
    note: str | None = None


def open_image(data: bytes) -> Image.Image:
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise NotAnImage("Файл не похож на изображение") from e
    # Phones store the rotation in EXIF; without this the photo can come out sideways.
    return ImageOps.exif_transpose(im)


def prepare_upload(data: bytes, kind: str) -> Prepared:
    """Turn an uploaded picture into what is stored.

    kind="product": a product photo in the shop format (600×600 JPEG, white background).
    kind="original": a banner or a logo, only made smaller; transparency is kept (PNG).
    """
    im = open_image(data)
    if kind == "product":
        result, status = normalize(im)
        if result is not None:
            return Prepared(jpeg_bytes(result, marked=True), ".jpg", "image/jpeg", True)
        if status == "already normalized":
            return Prepared(jpeg_bytes(flatten(im), marked=True), ".jpg", "image/jpeg", True)
        im = flatten(im)
        im.thumbnail((MAX_OTHER_SIDE, MAX_OTHER_SIDE), Image.Resampling.LANCZOS)
        note = SKIP_REASONS.get(status, status)
        return Prepared(jpeg_bytes(im, marked=False), ".jpg", "image/jpeg", False, note)

    im.thumbnail((MAX_OTHER_SIDE, MAX_OTHER_SIDE), Image.Resampling.LANCZOS)
    if im.mode in ("RGBA", "LA", "P") and (im.mode != "P" or "transparency" in im.info):
        buf = io.BytesIO()
        im.convert("RGBA").save(buf, "PNG", optimize=True)
        return Prepared(buf.getvalue(), ".png", "image/png", False)
    return Prepared(jpeg_bytes(im.convert("RGB"), marked=False), ".jpg", "image/jpeg", False)
