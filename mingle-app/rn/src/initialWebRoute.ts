import { compareApiNamespaceVersions, parseApiNamespaceVersion } from './apiNamespace';

/**
 * Which web route the native shell opens on a plain app launch.
 *
 * The plan: on a build whose API namespace supports the posting feed
 * (>= v2.1.0), the feed is the home screen; older namespaces have no posting
 * routes and stay on the conversation list. This is the DEFAULT only — a live
 * conversation/STT restore target or a pending push tap take precedence and are
 * resolved elsewhere (webViewRestore, pushNavigation), so this function is used
 * strictly to pick the base landing route when nothing else is pending.
 *
 * Kept as a pure function of the (validated) namespace so the choice is unit
 * testable without the native shell.
 */

/** First namespace version that ships the posting feed. */
const POSTING_FEED_MIN_VERSION = [2, 1, 0] as const;

export type InitialWebRoute = 'feed' | 'conversations';

/**
 * True when the namespace is recognised AND at or above the posting-feed
 * minimum. An empty/malformed namespace is treated as NOT supporting posting
 * (conservative: fall back to the conversation list rather than showing a feed
 * that would 404).
 */
export function namespaceSupportsPostingFeed(validatedApiNamespace: string): boolean {
  const parsed = parseApiNamespaceVersion(validatedApiNamespace);
  if (!parsed) return false;
  return compareApiNamespaceVersions(parsed.version, POSTING_FEED_MIN_VERSION) >= 0;
}

/**
 * The single path segment the launch URL should target. Posting-capable builds
 * land on the feed; everything else on the conversation list.
 */
export function resolveInitialWebRoute(validatedApiNamespace: string): InitialWebRoute {
  return namespaceSupportsPostingFeed(validatedApiNamespace) ? 'feed' : 'conversations';
}
