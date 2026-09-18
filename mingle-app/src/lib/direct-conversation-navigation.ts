import {
  NATIVE_SKIP_CONVERSATION_RESTORE_QUERY_KEY,
  NATIVE_TAB_ROOT_QUERY_KEY,
} from "@/lib/tab-navigation";

export type DirectConversationNavigationRouter = {
  replace: (href: string) => void;
  push: (href: string) => void;
};

const CONVERSATION_QUERY_KEY = "conversation";
export const DIRECT_CONVERSATION_NAVIGATION_GUARD_MS = 2500;

function toRouteHref(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Establish the canonical [conversation list] -> [conversation room] stack.
 *
 * The entry underneath the room must be the list, not the profile/picker
 * surface the caller is leaving — otherwise back/edge-swipe can resurface
 * that intermediate surface instead of the list (see this file's git
 * history for the original bug this fixed). Earlier this was done by
 * actually navigating there with `router.replace()`, waiting a couple
 * frames for it to mount and consume its own tab-root/restore markers, and
 * only then pushing the room — which is correct but visibly flashes the
 * list for a frame or two before the room appears.
 *
 * `history.replaceState` rewrites the CURRENT entry's URL without asking
 * Next.js to render it — the browser's history stack ends up with the same
 * [list, room] shape (a later back-navigation's popstate resyncs Next's
 * router from the real `window.location`, so the list mounts normally then
 * and still consumes its own markers), but the picker/profile screen goes
 * straight to the room with no intermediate paint of the list route.
 */
export function replaceWithConversationListThenPush(
  router: DirectConversationNavigationRouter,
  listHref: string,
  conversationId: string,
): void {
  if (typeof window === "undefined") return;

  const listUrl = new URL(listHref, window.location.href);
  listUrl.searchParams.delete(CONVERSATION_QUERY_KEY);
  window.history.replaceState(window.history.state, "", toRouteHref(listUrl));

  const roomUrl = new URL(listUrl.href);
  roomUrl.searchParams.delete(NATIVE_TAB_ROOT_QUERY_KEY);
  roomUrl.searchParams.delete(NATIVE_SKIP_CONVERSATION_RESTORE_QUERY_KEY);
  roomUrl.searchParams.set(CONVERSATION_QUERY_KEY, conversationId);
  router.push(toRouteHref(roomUrl));
}
