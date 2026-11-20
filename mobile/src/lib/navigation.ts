import { router, type Href } from "expo-router";

/**
 * After signing in or registering: close the sign-in screen and go on to where the customer was
 * heading (`next`, e.g. "/checkout"). Only plain screens of the app are accepted.
 */
export function afterAuth(next: string | undefined) {
  if (router.canGoBack()) router.back();
  if (next && /^\/[a-z-]+$/.test(next)) router.push(next as Href);
}
