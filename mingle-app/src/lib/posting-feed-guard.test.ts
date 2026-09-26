import { describe, expect, it } from "vitest";
import {
  conversationsHref,
  inferNativeApiNamespaceFromSearchParams,
  requestNamespaceSupportsPostingFeed,
} from "./posting-feed-guard";

describe("conversationsHref", () => {
  it("builds the locale-scoped conversation list path", () => {
    expect(conversationsHref("ko")).toBe("/ko/conversations");
    expect(conversationsHref("en")).toBe("/en/conversations");
  });
});

describe("inferNativeApiNamespaceFromSearchParams", () => {
  it("recovers a namespace from the native shell platform + version", () => {
    expect(
      inferNativeApiNamespaceFromSearchParams({ nativePlatform: "ios", nativeClientVersion: "2.0.4" }),
    ).toBe("ios/v2.0.4");
    expect(
      inferNativeApiNamespaceFromSearchParams({ nativePlatform: "android", nativeClientVersion: "v2.1.0" }),
    ).toBe("android/v2.1.0");
  });

  it("returns '' when the shell params are missing or malformed", () => {
    expect(inferNativeApiNamespaceFromSearchParams({})).toBe("");
    expect(
      inferNativeApiNamespaceFromSearchParams({ nativePlatform: "windows", nativeClientVersion: "2.0.4" }),
    ).toBe("");
    expect(
      inferNativeApiNamespaceFromSearchParams({ nativePlatform: "ios", nativeClientVersion: "2.0" }),
    ).toBe("");
  });
});

describe("requestNamespaceSupportsPostingFeed", () => {
  it("supports a 2.2.0+ app namespace (explicit apiNamespace query)", () => {
    expect(requestNamespaceSupportsPostingFeed({ apiNamespace: "ios/v2.2.0" })).toBe(true);
    expect(requestNamespaceSupportsPostingFeed({ apiNs: "android/v2.2.0" })).toBe(true);
  });

  it("gates a pre-2.2.0 app namespace (e.g. 2.1.x / 2.0.x) out of the posting feed", () => {
    expect(requestNamespaceSupportsPostingFeed({ apiNamespace: "ios/v2.1.0" })).toBe(false);
    expect(requestNamespaceSupportsPostingFeed({ apiNamespace: "ios/v2.0.4" })).toBe(false);
    expect(requestNamespaceSupportsPostingFeed({ apiNamespace: "android/v2.0.0" })).toBe(false);
    expect(requestNamespaceSupportsPostingFeed({ apiNamespace: "ios/v1.1.3" })).toBe(false);
  });

  it("treats a request with no namespace as the shared-web default (supported)", () => {
    expect(requestNamespaceSupportsPostingFeed({})).toBe(true);
    expect(requestNamespaceSupportsPostingFeed({ postId: "p1" })).toBe(true);
  });

  it("recovers a pre-2.2.0 native shell that dropped apiNamespace but kept native params", () => {
    expect(
      requestNamespaceSupportsPostingFeed({ nativePlatform: "ios", nativeClientVersion: "2.0.4" }),
    ).toBe(false);
  });

  it("prefers the explicit namespace query over the inferred native namespace", () => {
    expect(
      requestNamespaceSupportsPostingFeed({
        apiNamespace: "ios/v2.2.0",
        nativePlatform: "ios",
        nativeClientVersion: "2.0.4",
      }),
    ).toBe(true);
  });

  it("reads the first value of an array-valued namespace query", () => {
    expect(requestNamespaceSupportsPostingFeed({ apiNamespace: ["ios/v2.0.4"] })).toBe(false);
    expect(requestNamespaceSupportsPostingFeed({ apiNamespace: ["ios/v2.2.0"] })).toBe(true);
  });
});
