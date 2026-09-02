import { describe, expect, it } from "vitest";
import { parseNativeProfileLinkOverlayRequest } from "@/lib/native-profile-link-overlay";

describe("native profile link overlay requests", () => {
  it("accepts a native profile target and optional trace values", () => {
    expect(parseNativeProfileLinkOverlayRequest({
      userId: "cmg123abc",
      linkNonce: "launch-2",
      navigationSequence: 2,
    })).toEqual({
      userId: "cmg123abc",
      linkNonce: "launch-2",
      navigationSequence: 2,
    });
  });

  it("rejects malformed or unsafe profile targets", () => {
    expect(parseNativeProfileLinkOverlayRequest(null)).toBeNull();
    expect(parseNativeProfileLinkOverlayRequest({ userId: "not valid" })).toBeNull();
    expect(parseNativeProfileLinkOverlayRequest({ userId: "https://example.com" })).toBeNull();
  });
});
