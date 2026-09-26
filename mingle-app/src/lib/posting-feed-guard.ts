import { namespaceSupportsPostingFeed } from "@/lib/api-contract";
import { readRequestedApiNamespaceFromSearchParams } from "@/lib/client-behavior-profile";

/**
 * Rollout gate (W4 / D). The web UI is shared by every installed app version,
 * but the posting routes exist only from the v2.1.0 namespace on. A 2.0.x app
 * (or any pre-2.1.0 namespace) that shows a posting entry point would get 404s,
 * so every posting entry point gates on the single frozen rule
 * `namespaceSupportsPostingFeed` — never on a hand-rolled version comparison.
 *
 * These helpers are the one place that turns "which namespace is this request /
 * client on" into that boolean, so the home redirect (server) and the direct
 * screen guards (client) cannot drift apart.
 */

/** Where an unsupported client is sent instead of any posting screen. */
export function conversationsHref(locale: string): string {
  return `/${locale}/conversations`;
}

function readSearchParamValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const rawValue = searchParams[key];
  if (typeof rawValue === "string") return rawValue.trim();
  if (Array.isArray(rawValue)) return (rawValue[0] || "").trim();
  return "";
}

/**
 * The native app shell may keep its platform/version query even when the
 * `apiNamespace` query was dropped on a partial route transition. Recovering the
 * namespace from those (mirrors the conversations page's own recovery) means a
 * native pre-2.1.0 shell is still recognised as an app — and gated — rather than
 * mistaken for a plain web visitor. Returns '' when there is nothing app-shaped
 * to read.
 */
export function inferNativeApiNamespaceFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const platform = readSearchParamValue(searchParams, "nativePlatform").toLowerCase();
  const clientVersion = readSearchParamValue(searchParams, "nativeClientVersion").replace(/^v/i, "");
  if (platform !== "ios" && platform !== "android") return "";
  if (!/^\d+\.\d+\.\d+$/.test(clientVersion)) return "";
  return `${platform}/v${clientVersion}`;
}

/**
 * Server-side gate for the landing redirect. A server component must not trust
 * the module-load `clientSupportsPostingFeed` (it reflects build-time env only),
 * so it reads the namespace the app shell put on the request instead.
 *
 * Resolution order: the explicit `apiNamespace` / `apiNs` query, then a native
 * namespace inferred from the native shell params, then '' (the plain-web
 * default). `namespaceSupportsPostingFeed('')` is true, so a plain web visit and
 * an undeterminable request stay on the shared-web behaviour (feed); only a
 * request that resolves to an explicit pre-2.1.0 namespace is gated out.
 */
export function requestNamespaceSupportsPostingFeed(
  searchParams: Record<string, string | string[] | undefined>,
): boolean {
  const requestedNamespace = readRequestedApiNamespaceFromSearchParams(searchParams)
    || inferNativeApiNamespaceFromSearchParams(searchParams);
  return namespaceSupportsPostingFeed(requestedNamespace);
}
