import { describe, expect, it } from "vitest";
import { resolvePostHogBrowserConfig } from "@/lib/posthog-browser-config";

describe("resolvePostHogBrowserConfig", () => {
  it("reuses a PostHog Cloud project token for browser analytics", () => {
    expect(resolvePostHogBrowserConfig({
      POSTHOG_TOKEN: "phc_project_token_123",
      POSTHOG_HOST: "https://eu.i.posthog.com/",
    })).toEqual({
      projectToken: "phc_project_token_123",
      host: "https://eu.i.posthog.com",
    });
  });

  it("does not expose an unrecognized server token without an explicit public token", () => {
    expect(resolvePostHogBrowserConfig({
      POSTHOG_TOKEN: "personal_or_unknown_token",
    })).toBeNull();
  });

  it("accepts an explicit browser project token and rejects unsafe hosts", () => {
    expect(resolvePostHogBrowserConfig({
      POSTHOG_PUBLIC_TOKEN: "self-hosted-project-token",
      POSTHOG_HOST: "http://untrusted.example.com",
    })).toEqual({
      projectToken: "self-hosted-project-token",
      host: "https://us.i.posthog.com",
    });
  });
});
