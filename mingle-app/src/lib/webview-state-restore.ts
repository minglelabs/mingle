// Saves the visible screen state (scroll positions) when the native app goes
// to the background, and re-applies it when iOS killed the backgrounded
// process and the RN shell reopens the same screen on the next cold start.
//
// Scroll containers opt in with `data-restore-scroll="<key>"`. A container
// whose content shifts as data loads (a chat) can also name the attribute that
// identifies its items with `data-restore-anchor="<attribute>"`; its position
// is then saved relative to the first visible item instead of a raw offset.
// `data-restore-scroll-default="end"` marks a container that already opens at
// its end (a chat), so a position saved at the end is left to it.

export const WEBVIEW_STATE_RESTORE_STORAGE_KEY = "mingle:webview-state-restore-v1";
// Matches the native shell's restore URL TTL.
export const WEBVIEW_STATE_RESTORE_TTL_MS = 12 * 60 * 60 * 1000;
export const RESTORE_SCROLL_ATTRIBUTE = "data-restore-scroll";
export const RESTORE_ANCHOR_ATTRIBUTE = "data-restore-anchor";
export const RESTORE_SCROLL_DEFAULT_ATTRIBUTE = "data-restore-scroll-default";
// Dispatched (non-bubbling) on a container right before the restorer scrolls
// it, so screens that auto-follow new content can treat it like a user scroll.
export const RESTORE_SCROLL_EVENT = "mingle:webview-state-restore-scroll";

// Query params the pages read themselves; everything else in the URL is
// native runtime state that differs between launches.
const SCREEN_QUERY_KEYS = ["conversation", "tab", "q", "profileHandle", "profileUserId", "kind", "authorId", "postId"];
const AT_END_THRESHOLD_PX = 24;

export type SavedScrollPosition = {
  top: number;
  atEnd: boolean;
  anchorId?: string;
  anchorOffset?: number;
};

export type WebViewStateSnapshot = {
  version: 1;
  savedAtMs: number;
  accountKey: string;
  screenKey: string;
  scroll: Record<string, SavedScrollPosition>;
};

export function resolveWebViewStateScreenKey(href: string): string {
  try {
    const url = new URL(href);
    const query = SCREEN_QUERY_KEYS
      .map((key) => [key, (url.searchParams.get(key) || "").trim()] as const)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return query ? `${pathname}?${query}` : pathname;
  } catch {
    return "";
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseScrollPosition(value: unknown): SavedScrollPosition | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<SavedScrollPosition>;
  if (!isFiniteNumber(raw.top) || raw.top < 0) return null;
  const position: SavedScrollPosition = { top: raw.top, atEnd: raw.atEnd === true };
  if (typeof raw.anchorId === "string" && raw.anchorId && isFiniteNumber(raw.anchorOffset)) {
    position.anchorId = raw.anchorId;
    position.anchorOffset = raw.anchorOffset;
  }
  return position;
}

export function parseWebViewStateSnapshot(
  rawValue: string | null,
  expected: { nowMs: number; accountKey: string; screenKey: string },
): WebViewStateSnapshot | null {
  if (!rawValue || !expected.accountKey || !expected.screenKey) return null;
  try {
    const parsed = JSON.parse(rawValue) as Partial<WebViewStateSnapshot>;
    if (parsed.version !== 1 || !isFiniteNumber(parsed.savedAtMs)) return null;
    if (expected.nowMs - parsed.savedAtMs > WEBVIEW_STATE_RESTORE_TTL_MS) return null;
    if (parsed.accountKey !== expected.accountKey || parsed.screenKey !== expected.screenKey) return null;
    const scroll: Record<string, SavedScrollPosition> = {};
    for (const [key, value] of Object.entries(parsed.scroll ?? {})) {
      const position = parseScrollPosition(value);
      if (key && position) scroll[key] = position;
    }
    return {
      version: 1,
      savedAtMs: parsed.savedAtMs,
      accountKey: parsed.accountKey,
      screenKey: parsed.screenKey,
      scroll,
    };
  } catch {
    return null;
  }
}

type ScrollMetrics = { scrollTop: number; scrollHeight: number; clientHeight: number };

export function isScrolledToEnd(metrics: ScrollMetrics): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= AT_END_THRESHOLD_PX;
}

// A saved position needs work only when the screen would not open there anyway.
export function shouldRestoreScrollPosition(
  position: SavedScrollPosition,
  defaultsToEnd: boolean,
): boolean {
  if (defaultsToEnd) return !position.atEnd;
  return position.top > 1;
}

function isVisibleElement(element: HTMLElement): boolean {
  return element.clientHeight > 0 && element.getClientRects().length > 0;
}

function readAnchorAttribute(container: HTMLElement): string {
  const attribute = (container.getAttribute(RESTORE_ANCHOR_ATTRIBUTE) || "").trim();
  return /^data-[a-z0-9-]+$/.test(attribute) ? attribute : "";
}

export function findRestoreScrollContainer(key: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  for (const element of Array.from(document.querySelectorAll<HTMLElement>(`[${RESTORE_SCROLL_ATTRIBUTE}]`))) {
    if (element.getAttribute(RESTORE_SCROLL_ATTRIBUTE) === key && isVisibleElement(element)) return element;
  }
  return null;
}

function captureScrollPosition(container: HTMLElement): SavedScrollPosition {
  const position: SavedScrollPosition = {
    top: Math.max(0, Math.round(container.scrollTop)),
    atEnd: isScrolledToEnd(container),
  };
  const anchorAttribute = readAnchorAttribute(container);
  if (!anchorAttribute) return position;

  const containerTop = container.getBoundingClientRect().top;
  for (const item of Array.from(container.querySelectorAll<HTMLElement>(`[${anchorAttribute}]`))) {
    const rect = item.getBoundingClientRect();
    if (rect.height <= 0 || rect.bottom <= containerTop) continue;
    const anchorId = item.getAttribute(anchorAttribute) || "";
    if (!anchorId) break;
    position.anchorId = anchorId;
    position.anchorOffset = Math.round(rect.top - containerTop);
    break;
  }
  return position;
}

export function captureWebViewStateSnapshot(params: {
  nowMs: number;
  accountKey: string;
  href: string;
}): WebViewStateSnapshot | null {
  if (typeof document === "undefined" || !params.accountKey) return null;
  const screenKey = resolveWebViewStateScreenKey(params.href);
  if (!screenKey) return null;

  const scroll: Record<string, SavedScrollPosition> = {};
  for (const container of Array.from(document.querySelectorAll<HTMLElement>(`[${RESTORE_SCROLL_ATTRIBUTE}]`))) {
    const key = container.getAttribute(RESTORE_SCROLL_ATTRIBUTE) || "";
    if (!key || scroll[key] || !isVisibleElement(container)) continue;
    scroll[key] = captureScrollPosition(container);
  }
  return {
    version: 1,
    savedAtMs: params.nowMs,
    accountKey: params.accountKey,
    screenKey,
    scroll,
  };
}

export type ScrollRestoreStep = "pending" | "applied" | "skip";

// One attempt at putting a container back where it was. Content arrives in
// pages, so the caller retries until the target is reachable and holds.
export function applySavedScrollPosition(
  container: HTMLElement,
  position: SavedScrollPosition,
): ScrollRestoreStep {
  const anchorAttribute = readAnchorAttribute(container);
  const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
  let targetTop: number | null = null;

  if (anchorAttribute && position.anchorId) {
    const selector = `[${anchorAttribute}="${CSS.escape(position.anchorId)}"]`;
    const item = container.querySelector<HTMLElement>(selector);
    if (!item) return "pending";
    const offset = item.getBoundingClientRect().top - container.getBoundingClientRect().top;
    targetTop = container.scrollTop + offset - (position.anchorOffset ?? 0);
  } else if (anchorAttribute) {
    // Without its anchor the raw offset means nothing in a list that grows
    // from the end; leave the screen's own default.
    return "skip";
  } else {
    targetTop = position.top;
    if (targetTop > maxTop + 1) {
      // Not enough loaded yet: reaching the end is what makes infinite lists
      // fetch their next page.
      container.dispatchEvent(new Event(RESTORE_SCROLL_EVENT));
      container.scrollTop = maxTop;
      return "pending";
    }
  }

  const clampedTop = Math.max(0, Math.min(maxTop, Math.round(targetTop)));
  if (Math.abs(container.scrollTop - clampedTop) > 1) {
    container.dispatchEvent(new Event(RESTORE_SCROLL_EVENT));
    container.scrollTop = clampedTop;
  }
  return Math.abs(container.scrollTop - clampedTop) <= 2 ? "applied" : "pending";
}

export function readStoredWebViewStateSnapshot(): string | null {
  try {
    return window.localStorage.getItem(WEBVIEW_STATE_RESTORE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeWebViewStateSnapshot(snapshot: WebViewStateSnapshot): void {
  try {
    window.localStorage.setItem(WEBVIEW_STATE_RESTORE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage full or blocked: the screen just opens at its default position.
  }
}

export function clearStoredWebViewStateSnapshot(): void {
  try {
    window.localStorage.removeItem(WEBVIEW_STATE_RESTORE_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}
