import type { NextRequest } from "next/server";
import { digestAnalyticsValue } from "@/lib/search-analytics";

export type PostHogRequestContext = {
  distinctId: string;
  accountIdDigest: string | null;
  trackingSource: "header" | "cookie" | "account_digest";
  clientPlatform: string | null;
  apiNamespace: string | null;
  appVersion: string | null;
};

function readRequestValue(value: string | null | undefined): string {
  return (value || "").trim().slice(0, 128);
}

export async function buildPostHogRequestContext(
  request: NextRequest,
  accountId: string,
): Promise<PostHogRequestContext> {
  const headerTrackingId = readRequestValue(
    request.headers.get("x-mingle-user-id") || request.headers.get("x-posthog-distinct-id"),
  );
  const cookieTrackingId = readRequestValue(request.cookies.get("mingle_uid")?.value);
  const accountIdDigest = await digestAnalyticsValue(accountId);
  const accountDigestId = accountIdDigest ? `mingle-account-${accountIdDigest}` : "mingle-account-unknown";

  return {
    distinctId: headerTrackingId || cookieTrackingId || accountDigestId,
    accountIdDigest,
    trackingSource: headerTrackingId ? "header" : cookieTrackingId ? "cookie" : "account_digest",
    clientPlatform: readRequestValue(request.headers.get("x-mingle-client-platform")) || null,
    apiNamespace: readRequestValue(request.headers.get("x-mingle-api-namespace")) || null,
    appVersion: readRequestValue(request.headers.get("x-mingle-app-version")) || null,
  };
}
