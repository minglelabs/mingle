export const NATIVE_SKIP_CONVERSATION_RESTORE_QUERY_KEY = "nativeSkipConversationRestore";
export const NATIVE_TAB_ROOT_QUERY_KEY = "nativeTabRoot";

const PRESERVED_NATIVE_QUERY_KEYS = [
  "apiNamespace",
  "apiNs",
  "debug",
  "inset",
  "nativeAuth",
  "nativeBannerPosition",
  "nativeBottomInsetPx",
  "nativeClientBuild",
  "nativeClientVersion",
  "nativeConversationBannerPosition",
  "nativeConversationBottomInsetPx",
  "nativeConversationTopInsetPx",
  "nativeListTopInsetPx",
  "nativePlatform",
  "nativeQa",
  "nativeStt",
  "nativeTopInsetPx",
  "nativeUi",
  "qa",
  "sttDebug",
  "ttsDebug",
] as const;

// A top-level tab URL opened from the native shell's tab bar. These screens
// are rendered without server-loaded user data (the client hydrates from its
// own caches and refreshes after mount), so the route payload is the same for
// every visit and is safe to prefetch and reuse across tab switches.
export function isNativeTabRootSearch(
  readParam: (key: string) => string | null | undefined,
): boolean {
  return readParam("nativeUi") === "1"
    && readParam(NATIVE_TAB_ROOT_QUERY_KEY) === "1"
    && !readParam("conversation");
}

export function isNativeTabRootHref(href: string): boolean {
  const queryIndex = href.indexOf("?");
  if (queryIndex < 0) return false;

  const searchParams = new URLSearchParams(href.slice(queryIndex + 1));
  return isNativeTabRootSearch((key) => searchParams.get(key));
}

export function buildNativeAwareTabPath(
  pathname: string,
  searchParams: Pick<URLSearchParams, "getAll">,
  options?: {
    preserveConversation?: boolean;
    skipConversationRestore?: boolean;
    tabRoot?: boolean;
  },
): string {
  const nextSearchParams = new URLSearchParams();

  for (const key of PRESERVED_NATIVE_QUERY_KEYS) {
    for (const value of searchParams.getAll(key)) {
      nextSearchParams.append(key, value);
    }
  }

  if (options?.preserveConversation) {
    for (const value of searchParams.getAll("conversation")) {
      nextSearchParams.append("conversation", value);
    }
  }

  if (options?.skipConversationRestore) {
    nextSearchParams.set(NATIVE_SKIP_CONVERSATION_RESTORE_QUERY_KEY, "1");
  }
  if (options?.tabRoot) {
    nextSearchParams.set(NATIVE_TAB_ROOT_QUERY_KEY, "1");
  }

  const nextSearch = nextSearchParams.toString();
  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
}
