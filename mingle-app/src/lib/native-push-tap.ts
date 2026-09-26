import { resolveSupportedLocaleTag } from "@/i18n";
import { conversationsHref } from "@/lib/posting-feed-guard";
import { buildNativeAwareTabPath } from "@/lib/tab-navigation";

/**
 * Web-side receiver contract for a native push-notification tap. Must match
 * `rn/src/pushNavigation.ts` (`NATIVE_PUSH_TAP_EVENT`,
 * `NATIVE_PUSH_TAP_WINDOW_KEY`, `buildNativePushTapEventScript`).
 */
export const NATIVE_PUSH_TAP_EVENT = "mingle:native-push-tap";
export const NATIVE_PUSH_TAP_WINDOW_KEY = "__MINGLE_PENDING_NATIVE_PUSH_TAP";

export type NativePushTapRequest = {
  path: string;
  sequence: number;
};

export type NativePushTapNavigation =
  | { kind: "conversation"; conversationListHref: string; conversationId: string }
  | { kind: "route"; href: string };

const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const THROWAWAY_ORIGIN = "https://mingle.invalid";

/** First path segment (after the locale) of every posting-feed screen (all gated on v2.2.0+). */
const POSTING_ROUTE_ROOTS = new Set(["feed", "posts", "compose", "notifications"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Same-origin relative path guard (mirrors the RN `isSafeRelativeAppPath`): a
 * single leading `/`, no scheme/authority, no control characters or
 * backslashes, no `..` segment. The web re-checks because the window slot is
 * page-writable.
 */
export function isSafeRelativeAppPath(value: unknown): value is string {
  const path = typeof value === "string" ? value : "";
  if (!path) return false;
  if (/[\u0000-\u001f\u007f\\]/.test(path)) return false;
  if (path[0] !== "/" || path[1] === "/") return false;
  const rawPathname = path.split(/[?#]/, 1)[0];
  if (rawPathname.split("/").some((segment) => segment === "..")) return false;
  try {
    return new URL(path, THROWAWAY_ORIGIN).origin === THROWAWAY_ORIGIN;
  } catch {
    return false;
  }
}

export function parseNativePushTapRequest(value: unknown): NativePushTapRequest | null {
  if (!isRecord(value)) return null;
  const path = typeof value.path === "string" ? value.path.trim() : "";
  if (!isSafeRelativeAppPath(path)) return null;
  const sequence = typeof value.sequence === "number" && Number.isInteger(value.sequence) && value.sequence > 0
    ? value.sequence
    : 0;
  return { path, sequence };
}

function isPostingRoute(segments: string[]): boolean {
  const root = segments[1] ?? "";
  if (POSTING_ROUTE_ROOTS.has(root)) return true;
  return root === "mypage" && segments[2] === "posts";
}

/**
 * Turn a validated push destination into the in-app navigation to perform.
 *
 * - `/{locale}/conversations?conversation={id}` → the canonical
 *   [list, room] stack (so back returns to the list, not the previous screen).
 * - A posting route (feed/post/comment sheet, compose, notifications) → that
 *   route, but only when the client supports posting; an older client is sent
 *   to the conversation list instead of a screen whose API would 404.
 * - Any other same-origin route (e.g. `/{locale}/users/{id}`) → that route.
 *
 * The native shell's query (apiNamespace, platform, insets, ...) from the
 * current page is carried over so the destination keeps the app context.
 * Returns null when the path has no supported locale or a malformed room id.
 */
export function resolveNativePushTapNavigation(
  path: string,
  options: {
    currentSearchParams: Pick<URLSearchParams, "getAll">;
    supportsPostingFeed: boolean;
  },
): NativePushTapNavigation | null {
  if (!isSafeRelativeAppPath(path)) return null;
  const target = new URL(path, THROWAWAY_ORIGIN);
  const segments = target.pathname.split("/").filter(Boolean);
  const locale = resolveSupportedLocaleTag(segments[0] ?? "");
  if (!locale || locale !== segments[0]) return null;

  const { currentSearchParams } = options;

  if (segments[1] === "conversations" && segments.length === 2) {
    const conversationId = (target.searchParams.get("conversation") ?? "").trim();
    const conversationListHref = buildNativeAwareTabPath(
      `/${locale}/conversations`,
      currentSearchParams,
      { skipConversationRestore: true, tabRoot: true },
    );
    if (!conversationId) {
      return { kind: "route", href: conversationListHref };
    }
    if (!CONVERSATION_ID_PATTERN.test(conversationId)) return null;
    return { kind: "conversation", conversationListHref, conversationId };
  }

  if (isPostingRoute(segments) && !options.supportsPostingFeed) {
    return {
      kind: "route",
      href: buildNativeAwareTabPath(conversationsHref(locale), currentSearchParams, { tabRoot: true }),
    };
  }

  const href = new URL(
    buildNativeAwareTabPath(target.pathname, currentSearchParams),
    THROWAWAY_ORIGIN,
  );
  target.searchParams.forEach((value, key) => {
    href.searchParams.set(key, value);
  });
  href.hash = target.hash;
  return { kind: "route", href: `${href.pathname}${href.search}${href.hash}` };
}

export type NativePushTapHandlerDeps = {
  /** Current page query (`window.location.search`), to carry the native shell params over. */
  readCurrentSearch: () => string;
  supportsPostingFeed: () => boolean;
  /** Remove the pending request from the window slot. */
  clearPendingRequest: () => void;
  pushRoute: (href: string) => void;
  openConversation: (conversationListHref: string, conversationId: string) => void;
};

/**
 * Build the receiver for native push-tap requests (event detail or window
 * slot). The same request can arrive through both, so a repeated `sequence`
 * is routed only once.
 */
export function createNativePushTapHandler(deps: NativePushTapHandlerDeps): (rawRequest: unknown) => void {
  let lastSequence = 0;
  return (rawRequest) => {
    deps.clearPendingRequest();
    const request = parseNativePushTapRequest(rawRequest);
    if (!request) return;
    if (request.sequence > 0 && request.sequence === lastSequence) return;
    lastSequence = request.sequence;

    const navigation = resolveNativePushTapNavigation(request.path, {
      currentSearchParams: new URLSearchParams(deps.readCurrentSearch()),
      supportsPostingFeed: deps.supportsPostingFeed(),
    });
    if (!navigation) return;
    if (navigation.kind === "conversation") {
      deps.openConversation(navigation.conversationListHref, navigation.conversationId);
      return;
    }
    deps.pushRoute(navigation.href);
  };
}
