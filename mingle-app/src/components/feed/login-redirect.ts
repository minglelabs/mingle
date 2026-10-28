import { composeHref, feedHref } from "@/lib/feed-routes";

/**
 * Where a feed sign-in returns to. The feed opens the app's own sign-in gate
 * (`FeedLoginSheet` → `MingleHome authOnly`, the same screen as the
 * conversation tab: terms sheet, native Apple / Google, email) with this as
 * its callback, so "like → login → back" lands on the post the viewer was
 * acting on. Every value is a same-origin path that `resolveSignInCallbackUrl`
 * accepts.
 */
export function loginReturnHref(locale: string, returnToPostId?: string | null): string {
  return returnToPostId ? feedHref(locale, { postId: returnToPostId }) : feedHref(locale);
}

/** Return path for the compose button: after login the viewer lands on compose. */
export function composeLoginReturnHref(locale: string): string {
  return composeHref(locale);
}
