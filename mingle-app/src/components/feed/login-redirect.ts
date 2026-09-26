import { feedHref } from "@/lib/feed-routes";

/**
 * Build the sign-in URL that returns the viewer to the same post after login.
 *
 * Mirrors `[locale]/auth/signin/page.tsx`, which reads `callbackUrl` and hands
 * off to the native-aware OAuth flow. The callback is the feed anchored on the
 * post the viewer was acting on, so "like → login → back" lands on that post.
 */
export function loginHref(locale: string, returnToPostId?: string | null): string {
  const callbackUrl = returnToPostId ? feedHref(locale, { postId: returnToPostId }) : feedHref(locale);
  const params = new URLSearchParams({ callbackUrl });
  return `/${locale}/auth/signin?${params.toString()}`;
}
