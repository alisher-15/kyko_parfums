/**
 * Links from outside the app. A product link is the website's, `https://<site>/products/12`
 * (what «Поделиться» sends): Android opens it here when the app is installed (app.json's
 * intent filter, verified by the site's /.well-known/assetlinks.json), and it becomes the
 * app's product screen, `/product/12`. Any other link stays as it is.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const pathname = path.startsWith("/") ? path : new URL(path).pathname;
    const product = /^\/products\/(\d+)\/?$/.exec(pathname);
    return product ? `/product/${product[1]}` : path;
  } catch {
    return path;
  }
}
