import { feedHref } from "@/lib/feed-routes";
import { buildNativeAwareTabHref } from "@/lib/tab-navigation";

/**
 * The home feed as a TAB ROOT (native shell keys + tab-root marker), for
 * `router.replace`. The home tab has nothing to go back to: landing on it
 * from a notification, a publish or an edit must not stack another feed entry,
 * or iOS offers an edge-swipe "back" into a stale copy of the screen.
 */
export function homeFeedRootHref(
  locale: string,
  target?: { postId?: string | null; commentId?: string | null },
): string {
  const current =
    typeof window !== "undefined" ? new URL(window.location.href).searchParams : new URLSearchParams();
  return buildNativeAwareTabHref(feedHref(locale, target), current, { tabRoot: true });
}
