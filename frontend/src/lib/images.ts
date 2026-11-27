import { getImageProps } from "next/image";

/** The R2 bucket's public address (`R2_PUBLIC_URL`, ending in "/"), whose photos are resized too. */
const BUCKET = process.env.NEXT_PUBLIC_PHOTO_BUCKET ?? "";

/**
 * The `<img>` attributes of a photo the page shows at `sizes` (a CSS sizes list, or a fixed CSS
 * width): our own photos (`/bottles/…`, `/media/…`, public files) and those in the R2 bucket come
 * from Next's image optimizer resized to the screen and as WebP, so a phone doesn't load a
 * 600–1200 px JPEG into a 120 px card. A photo from anywhere else (a link from an import) is
 * used as it is: the optimizer only fetches from hosts next.config.ts allows.
 */
export function photo(src: string, sizes: string | number) {
  const own = src.startsWith("/") && !src.startsWith("//");
  if (!own && !(BUCKET && src.startsWith(BUCKET))) return { src };
  // A number: a picture of that fixed CSS width (1x and 2x); a string: a sizes list.
  const fixed = typeof sizes === "number";
  const { props } = getImageProps({
    src,
    alt: "",
    width: fixed ? sizes : 1200,
    height: fixed ? sizes : 1200,
    sizes: fixed ? undefined : sizes,
  });
  return { src: props.src, srcSet: props.srcSet, sizes: props.sizes };
}
