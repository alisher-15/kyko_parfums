"""Make the product photos in a folder look the same size in the catalog.

The processing itself is app/services/images.py (the admin upload does the same to every product
photo). Photos whose background is not plain are left as they are and listed at the end.
Processed files carry a marker (a JPEG comment or a PNG text chunk), so running the script again
changes nothing: marked photos are skipped.

    pip install -r requirements.txt
    python scripts/normalize_photos.py ../frontend/public/bottles --dry-run
    python scripts/normalize_photos.py ../frontend/public/bottles
"""

import argparse
import sys
from pathlib import Path

from PIL import Image
from PIL.PngImagePlugin import PngInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.images import MARKER, normalize  # noqa: E402

EXTENSIONS = {".jpg", ".jpeg", ".png"}


def save_marked(im: Image.Image, path: Path, quality: int) -> None:
    """Save in the file's own format, keeping its name (product image URLs point to it)."""
    if path.suffix.lower() == ".png":
        info = PngInfo()
        info.add_text("kyko", MARKER)
        im.save(path, "PNG", optimize=True, pnginfo=info)
    else:
        im.save(path, "JPEG", quality=quality, optimize=True, progressive=True, comment=MARKER)


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
