import { describe, expect, it } from "vitest";
import {
  resolveMingleAnalyticsScreen,
  sanitizePostHogCaptureResult,
  sanitizePostHogNetworkRequest,
  stripUrlDetails,
} from "@/lib/posthog-client.logic";

describe("PostHog client privacy", () => {
  it("removes query strings and fragments from absolute and relative URLs", () => {
    expect(stripUrlDetails("https://mingle.example/ko/conversations?conversation=secret#room"))
      .toBe("https://mingle.example/ko/conversations");
    expect(stripUrlDetails("/ko/profile/user-id?token=secret"))
      .toBe("/ko/profile/user-id");
  });

  it("sanitizes automatically captured URL properties", () => {
    const result = sanitizePostHogCaptureResult({
      uuid: "event-1",
      event: "$pageview",
      properties: {
        $current_url: "https://mingle.example/en/conversations?conversation=private-id",
        $referrer: "https://example.com/path?email=private@example.com",
        safe_property: "kept",
      },
    });

    expect(result?.properties).toEqual({
      $current_url: "https://mingle.example/en/conversations",
      $referrer: "https://example.com/path",
      safe_property: "kept",
    });
  });

  it("drops network headers and bodies from replay metadata", () => {
    const result = sanitizePostHogNetworkRequest({
      name: "https://mingle.example/api/messages?conversation=private-id",
      entryType: "resource",
      startTime: 1,
      duration: 2,
      requestHeaders: { authorization: "secret" },
      responseHeaders: { "set-cookie": "secret" },
      requestBody: "private message",
      responseBody: "private translation",
    });

    expect(result.name).toBe("https://mingle.example/api/messages");
    expect(result.requestHeaders).toBeUndefined();
    expect(result.responseHeaders).toBeUndefined();
    expect(result.requestBody).toBeNull();
    expect(result.responseBody).toBeNull();
  });
});
describe("resolveMingleAnalyticsScreen", () => {
  it("labels a conversation query as a room without exposing its identifier", () => {
    expect(resolveMingleAnalyticsScreen(
      "/ko/conversations",
      new URLSearchParams("conversation=private-id"),
    )).toBe("conversation_room");
  });

  it("labels the main tab routes", () => {
    expect(resolveMingleAnalyticsScreen("/en/conversations")).toBe("conversation_list");
    expect(resolveMingleAnalyticsScreen("/en/connect")).toBe("connect");
    expect(resolveMingleAnalyticsScreen("/en/mypage")).toBe("my_page");
  });
});
