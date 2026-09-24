"""Make product photos look the same size in the catalog.

Supplier photos frame the bottle differently: in some it fills the whole picture, in others it is
small with a lot of empty background. For every photo the script:

1. finds the background colour from the corners;
2. crops the empty background around the bottle;
3. scales the bottle so its longer side takes the same share of the frame (1 - 2 × margin);
4. centres it on a square canvas of the background colour and saves a JPEG.

Light backgrounds are made pure white (the catalog cards are white). A pure black background is
usually a lost transparency (a PNG saved as JPEG) and is painted white from the edges; black bars
around a light photo go the same way. Photos whose corners differ (a gradient, an interior) are
left as they are and listed at the end. Processed files carry a marker (a JPEG comment or a PNG
text chunk), so running the script again changes nothing: marked photos are skipped.

    pip install Pillow
    python scripts/normalize_photos.py ../frontend/public/bottles --dry-run
    python scripts/normalize_photos.py ../frontend/public/bottles
"""

import argparse
import statistics
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter
from PIL.PngImagePlugin import PngInfo

EXTENSIONS = {".jpg", ".jpeg", ".png"}
# Written into every processed file; such files are skipped next time.
MARKER = "kyko:normalized"
# Difference from the background (0-255) that counts as "bottle", above JPEG noise.
THRESHOLD = 24
# Corners that differ more than this are not a plain background.
MAX_CORNER_SPREAD = 20
# Backgrounds at least this light are turned pure white.
WHITE_ENOUGH = 215
# Pure black backgrounds are usually a lost transparency (PNG saved as JPEG): they become white.
NEAR_BLACK = 16


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


def save_marked(im: Image.Image, path: Path, quality: int) -> None:
    """Save in the file's own format, keeping its name (product image URLs point to it)."""
    if path.suffix.lower() == ".png":
        info = PngInfo()
        info.add_text("kyko", MARKER)
        im.save(path, "PNG", optimize=True, pnginfo=info)
    else:
        im.save(path, "JPEG", quality=quality, optimize=True, progressive=True, comment=MARKER)


def normalize(im: Image.Image, size: int, margin: float) -> tuple[Image.Image | None, str]:
    """The normalized picture, or None with the reason it was left as is."""
    if is_marked(im):
        return None, "already normalized"
    im = im.convert("RGB")
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("folder", type=Path, help="folder with photos, changed in place")
    parser.add_argument("--size", type=int, default=600, help="side of the square, px")
    parser.add_argument("--margin", type=float, default=0.07, help="empty border per side, 0-0.3")
    parser.add_argument("--quality", type=int, default=85, help="JPEG quality")
    parser.add_argument("--dry-run", action="store_true", help="only report, change nothing")
    args = parser.parse_args(argv)

    files = sorted(p for p in args.folder.iterdir() if p.suffix.lower() in EXTENSIONS)
    if not files:
        print(f"No photos in {args.folder}", file=sys.stderr)
        return 1

    counts: dict[str, int] = {}
    skipped: list[str] = []
    before = after = 0
    for path in files:
        size_before = path.stat().st_size
        before += size_before
        with Image.open(path) as im:
            result, status = normalize(im, args.size, args.margin)
        counts[status] = counts.get(status, 0) + 1
        if result is None:
            after += size_before
            if status != "already normalized":
                skipped.append(f"{path.name}: {status}")
            continue
        if args.dry_run:
            after += size_before
            continue
        save_marked(result, path, args.quality)
        after += path.stat().st_size

    for status, n in sorted(counts.items()):
        print(f"{status}: {n}")
    if skipped:
        print("\nLeft as is:")
        print("\n".join(f"  {s}" for s in skipped))
    mb = 1024 * 1024
    print(f"\nTotal size: {before / mb:.1f} MB -> {after / mb:.1f} MB")
    if args.dry_run:
        print("Dry run: nothing was changed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
