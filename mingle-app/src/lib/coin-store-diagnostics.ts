"use client";

import { buildClientApiPath, detectRuntimePlatform } from "@/lib/api-contract";
import { getOrCreateTrackingUserId } from "@/components/LivePhoneDemo/realtime-storage";

/**
 * Field logs for the coin store: every place a purchase can fail on the device
 * (store products not loading, the native sheet erroring, server verification
 * refusing) plus purchase started/cancelled, so a purchase that never reaches
 * POST /coins/purchases still leaves a trace. Each report is a `coin_store_event`
 * row in app_event_logs (metadata.clientMetadata.kind).
 */
export function reportCoinStoreEvent(kind: string, details: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  try {
    void fetch(buildClientApiPath("/log/client-event"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-mingle-user-id": getOrCreateTrackingUserId() },
      body: JSON.stringify({
        eventType: "coin_store_event",
        metadata: {
          kind,
          ...details,
          runtimePlatform: detectRuntimePlatform(),
          pathname: window.location.pathname,
          atMs: Date.now(),
        },
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Logging must never affect the purchase flow.
  }
}
