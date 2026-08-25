"use client";

import posthog, { type Properties } from "posthog-js";
import { clientApiNamespace } from "@/lib/api-contract";
import { getOrCreateTrackingUserId, resetTrackingUserId } from "@/components/LivePhoneDemo/realtime-storage";
import {
  sanitizePostHogCaptureResult,
  sanitizePostHogNetworkRequest,
} from "@/lib/posthog-client.logic";

export type MingleClientEvent =
  | "mingle_app_opened"
  | "mingle_screen_viewed"
  | "mingle_signup_completed";

type SafeEventProperty = string | number | boolean | null | undefined;

let initialized = false;

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

export function initializeMinglePostHog(args: {
  projectToken: string;
  host: string;
}): void {
  if (initialized || typeof window === "undefined") return;

  const distinctId = getOrCreateTrackingUserId();
  posthog.init(args.projectToken, {
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
    before_send: sanitizePostHogCaptureResult,
  });
  posthog.identify(distinctId, resolveRuntimeProperties());
  posthog.register(resolveRuntimeProperties());
  initialized = true;
}

export function identifyMinglePostHogAccount(isAuthenticated: boolean): void {
  if (!initialized) return;
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
  if (!initialized) return;
  posthog.capture(event, {
    ...resolveRuntimeProperties(),
    ...properties,
  });
}

export function resetMinglePostHogIdentity(): void {
  if (initialized) posthog.reset(true);
  resetTrackingUserId();
}
