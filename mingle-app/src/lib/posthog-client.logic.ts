import type { CaptureResult, CapturedNetworkRequest, Properties } from "posthog-js";

const URL_PROPERTY_KEYS = [
  "$current_url",
  "$referrer",
  "$initial_current_url",
  "$session_entry_url",
  "$external_click_url",
] as const;

export type MingleAnalyticsScreen =
  | "account"
  | "add_members"
  | "connect"
  | "conversation_list"
  | "conversation_room"
  | "home"
  | "my_page"
  | "new_group"
  | "public_profile"
  | "unknown";

export function stripUrlDetails(rawValue: string): string {
  const value = rawValue.trim();
  if (!value) return value;

  try {
    const url = new URL(value, "https://mingle.invalid");
    url.search = "";
    url.hash = "";
    if (url.origin === "https://mingle.invalid") {
      return url.pathname;
    }
    return url.toString();
  } catch {
    return value.split(/[?#]/, 1)[0] || "";
  }
}
export function resolveMingleAnalyticsScreen(
  pathname: string,
  searchParams?: URLSearchParams,
): MingleAnalyticsScreen {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  // Checked before the conversation-room fallback below: unlike opening a
  // room, this screen always carries a ?conversation= id (the room being
  // invited into), so the generic check would otherwise misclassify it.
  if (/\/conversations\/add-members$/.test(normalizedPath)) return "add_members";
  if (searchParams?.get("conversation")) return "conversation_room";
  if (/\/conversations\/new-group$/.test(normalizedPath)) return "new_group";
  if (/\/conversations$/.test(normalizedPath)) return "conversation_list";
  if (/\/connect$/.test(normalizedPath)) return "connect";
  if (/\/mypage$/.test(normalizedPath)) return "my_page";
  if (/\/account$/.test(normalizedPath)) return "account";
  if (/\/profile\//.test(normalizedPath)) return "public_profile";
  if (/^\/(?:[a-z]{2}(?:-[A-Z]{2})?)?$/.test(normalizedPath)) return "home";
  return "unknown";
}

export function sanitizePostHogCaptureResult(
  captureResult: CaptureResult | null,
): CaptureResult | null {
  if (!captureResult) return null;

  const properties: Properties = { ...captureResult.properties };
  for (const key of URL_PROPERTY_KEYS) {
    const value = properties[key];
    if (typeof value === "string") properties[key] = stripUrlDetails(value);
  }

  return {
    ...captureResult,
    properties,
  };
}

export function sanitizePostHogNetworkRequest(
  request: CapturedNetworkRequest,
): CapturedNetworkRequest {
  return {
    ...request,
    name: stripUrlDetails(request.name),
    requestHeaders: undefined,
    responseHeaders: undefined,
    requestBody: null,
    responseBody: null,
  };
}
