import {
  NATIVE_SKIP_CONVERSATION_RESTORE_QUERY_KEY,
  NATIVE_TAB_ROOT_QUERY_KEY,
} from "@/lib/tab-navigation";

export type DirectConversationNavigationRouter = {
  replace: (href: string) => void;
  push: (href: string) => void;
};

const CONVERSATION_QUERY_KEY = "conversation";
const ROUTE_SETTLE_TIMEOUT_MS = 2000;
export const DIRECT_CONVERSATION_NAVIGATION_GUARD_MS = 2500;

function toRouteHref(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

function waitForAnimationFrame(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  return new Promise((resolve) => {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    window.setTimeout(resolve, 0);
  });
}

async function waitForRouteSettle(pathname: string): Promise<void> {
  if (typeof window === "undefined") return;

  const deadline = Date.now() + ROUTE_SETTLE_TIMEOUT_MS;
  while (window.location.pathname !== pathname && Date.now() < deadline) {
    await waitForAnimationFrame();
  }

  // Let the list screen mount and consume its tab-root/restore markers before
  // the room entry is pushed on top of it.
  await waitForAnimationFrame();
  await waitForAnimationFrame();
}

/**
 * Establish the canonical [conversation list] -> [conversation room] stack.
 * The list route is replaced first so the profile's parent tab cannot remain
 * underneath the room in browser or native WebView history.
 */
export async function replaceWithConversationListThenPush(
  router: DirectConversationNavigationRouter,
  listHref: string,
  conversationId: string,
): Promise<void> {
  if (typeof window === "undefined") return;

  const listUrl = new URL(listHref, window.location.href);
  listUrl.searchParams.delete(CONVERSATION_QUERY_KEY);
  router.replace(toRouteHref(listUrl));
  await waitForRouteSettle(listUrl.pathname);

  const roomUrl = new URL(listUrl.href);
  roomUrl.searchParams.delete(NATIVE_TAB_ROOT_QUERY_KEY);
  roomUrl.searchParams.delete(NATIVE_SKIP_CONVERSATION_RESTORE_QUERY_KEY);
  roomUrl.searchParams.set(CONVERSATION_QUERY_KEY, conversationId);
  router.push(toRouteHref(roomUrl));
}
