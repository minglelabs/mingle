"use client";

// Type-only: the SDK itself (~260 KB) is loaded after the first screen by
// PostHogAnalyticsProvider and handed to initializeMinglePostHog, so screens
// that only capture events do not carry it in their first-load bundle.
import type { CaptureResult, PostHog, Properties } from "posthog-js";
import { clientApiNamespace } from "@/lib/api-contract";
import type { FeedEventName } from "@/lib/feed-analytics";
import { getOrCreateTrackingUserId, resetTrackingUserId } from "@/components/LivePhoneDemo/realtime-storage";
import {
  sanitizePostHogCaptureResult,
  sanitizePostHogNetworkRequest,
} from "@/lib/posthog-client.logic";

export type MingleClientEvent =
  | "mingle_app_opened"
  | "mingle_screen_viewed"
  | "mingle_signup_completed"
  | "mingle_connect_search_requested"
  | "mingle_connect_search_completed"
  | "mingle_connect_follow_clicked"
  | "mingle_connect_follow_completed"
  // Posting-feed events; names and allowed properties live in `@/lib/feed-analytics`.
  | FeedEventName;

type SafeEventProperty = string | number | boolean | null | undefined;

let posthog: PostHog | null = null;
let initialized = false;
/** Session replay was running when an admin screen opened, so it resumes on leaving admin. */
let recordingPausedForAdmin = false;

/**
 * Events captured after the provider decided to start PostHog but before the
 * SDK finished loading. They are sent, with their original time, right after
 * it starts; without a pending start they are dropped as before.
 */
type PendingEvent = { event: MingleClientEvent; properties: Properties; capturedAtMs: number };
export const MAX_PENDING_POSTHOG_EVENTS = 100;
let startPending = false;
const pendingEvents: PendingEvent[] = [];

/** The provider will start PostHog shortly: keep events captured until then. */
export function markMinglePostHogStartPending(): void {
  if (!initialized) startPending = true;
}

/** Sends the events kept while the SDK loaded. Call once PostHog has started. */
export function flushMinglePostHogPendingEvents(): void {
  if (!initialized || !posthog) return;
  const events = pendingEvents.splice(0);
  for (const pending of events) {
    posthog.capture(pending.event, pending.properties, { timestamp: new Date(pending.capturedAtMs) });
  }
}

/**
 * Admin screens (`/admin`, `/admin/**`) show real users' messages and staff
 * tools, so nothing is sent to PostHog from them: no pageview, autocapture,
 * custom event or session replay.
 */
export function isPostHogExcludedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isOnExcludedPath(): boolean {
  return typeof window !== "undefined" && isPostHogExcludedPath(window.location.pathname);
}

function pathnameOf(url: string): string {
  try {
    return new URL(url, "https://mingle.invalid").pathname;
  } catch {
    return "";
  }
}

/**
 * First `before_send` hook: drops any event captured on an admin screen,
 * judged by the live location and by the event's own `$current_url`. Replay
 * snapshots go through `before_send` too, so a buffer flushed there is dropped.
 */
export function dropAdminCaptureResult(captureResult: CaptureResult | null): CaptureResult | null {
  if (!captureResult) return null;
  if (isOnExcludedPath()) return null;
  const currentUrl = captureResult.properties?.$current_url;
  if (typeof currentUrl === "string" && isPostHogExcludedPath(pathnameOf(currentUrl))) return null;
  return captureResult;
}

function resolveRuntimeProperties(): Properties {
  const apiNamespace = clientApiNamespace;
  const namespaceMatch = apiNamespace.match(/\/v(\d+\.\d+\.\d+)$/);
  const clientPlatform = apiNamespace.startsWith("ios/")
    ? "ios"
    : apiNamespace.startsWith("android/")
      ? "android"
      : "web";

  return {
    app_version: namespaceMatch?.[1] ?? null,
    api_namespace: apiNamespace || null,
    client_platform: clientPlatform,
    locale: document.documentElement.lang || navigator.language || null,
    pathname: window.location.pathname,
  };
}

/**
 * Starts PostHog once per page load with the loaded SDK. Returns whether it is
 * running, so the caller can retry on a later route: it never starts on an
 * admin screen. Kept events wait for `flushMinglePostHogPendingEvents`.
 */
export function initializeMinglePostHog(
  args: {
    projectToken: string;
    host: string;
  },
  sdk: PostHog,
): boolean {
  if (initialized) return true;
  if (typeof window === "undefined" || isOnExcludedPath()) return false;

  posthog = sdk;
  const distinctId = getOrCreateTrackingUserId();
  sdk.init(args.projectToken, {
    api_host: args.host,
    defaults: "2026-05-30",
    bootstrap: {
      distinctID: distinctId,
      isIdentifiedID: true,
    },
    person_profiles: "identified_only",
    autocapture: {
      dom_event_allowlist: ["click", "change", "submit"],
      element_allowlist: ["a", "button", "form", "input", "select", "textarea", "label"],
      css_selector_ignorelist: [
        ".ph-no-autocapture",
        "[data-ph-no-autocapture]",
        ".ph-no-capture",
      ],
      capture_copied_text: false,
    },
    capture_pageview: "history_change",
    capture_pageleave: true,
    capture_heatmaps: true,
    capture_dead_clicks: true,
    rageclick: true,
    capture_exceptions: false,
    capture_performance: {
      network_timing: true,
      web_vitals: true,
      web_vitals_allowed_metrics: ["LCP", "CLS", "FCP", "INP"],
    },
    disable_session_recording: false,
    enable_recording_console_log: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
      maskAllElementAttributes: true,
      recordHeaders: false,
      recordBody: false,
      captureCanvas: { recordCanvas: false },
      maskCapturedNetworkRequestFn: sanitizePostHogNetworkRequest,
    },
    mask_all_text: true,
    mask_all_element_attributes: true,
    mask_personal_data_properties: true,
    custom_personal_data_properties: [
      "email",
      "token",
      "auth",
      "sessionKey",
      "conversation",
      "userId",
    ],
    disable_capture_url_hashes: true,
    save_referrer: false,
    save_campaign_params: false,
    respect_dnt: true,
    tracing_headers: [window.location.hostname],
    before_send: [dropAdminCaptureResult, sanitizePostHogCaptureResult],
  });
  sdk.identify(distinctId, resolveRuntimeProperties());
  sdk.register(resolveRuntimeProperties());
  initialized = true;
  startPending = false;
  return true;
}

/**
 * Call on every route change. Entering an admin screen pauses a running
 * session replay; leaving admin resumes it. A replay that was not running
 * (sampling, remote config) is never started here.
 */
export function syncMinglePostHogRoute(pathname: string): void {
  if (!initialized || !posthog) return;
  if (isPostHogExcludedPath(pathname)) {
    if (!recordingPausedForAdmin && posthog.sessionRecordingStarted()) {
      posthog.stopSessionRecording();
      recordingPausedForAdmin = true;
    }
    return;
  }
  if (recordingPausedForAdmin) {
    recordingPausedForAdmin = false;
    posthog.startSessionRecording();
  }
}

export function identifyMinglePostHogAccount(isAuthenticated: boolean): void {
  if (!initialized || !posthog) return;
  posthog.identify(getOrCreateTrackingUserId(), {
    account_state: isAuthenticated ? "authenticated" : "anonymous",
  });
  posthog.register({
    account_state: isAuthenticated ? "authenticated" : "anonymous",
  });
}

export function captureMingleClientEvent(
  event: MingleClientEvent,
  properties?: Record<string, SafeEventProperty>,
): void {
  if (isOnExcludedPath()) return;
  if (initialized && posthog) {
    posthog.capture(event, {
      ...resolveRuntimeProperties(),
      ...properties,
    });
    return;
  }
  if (!startPending || typeof window === "undefined") return;
  // The screen the event happened on, not the one the SDK starts on.
  if (pendingEvents.length >= MAX_PENDING_POSTHOG_EVENTS) pendingEvents.shift();
  pendingEvents.push({
    event,
    properties: { ...resolveRuntimeProperties(), ...properties },
    capturedAtMs: Date.now(),
  });
}

export function resetMinglePostHogIdentity(): void {
  if (initialized && posthog) posthog.reset(true);
  // Kept events belong to the account that is signing out.
  pendingEvents.length = 0;
  resetTrackingUserId();
}
