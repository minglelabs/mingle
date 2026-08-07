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

export function buildNativeAwareTabPath(
  pathname: string,
  searchParams: Pick<URLSearchParams, "getAll">,
  options?: {
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

  if (options?.skipConversationRestore) {
    nextSearchParams.set(NATIVE_SKIP_CONVERSATION_RESTORE_QUERY_KEY, "1");
  }
  if (options?.tabRoot) {
    nextSearchParams.set(NATIVE_TAB_ROOT_QUERY_KEY, "1");
  }

  const nextSearch = nextSearchParams.toString();
  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
}
