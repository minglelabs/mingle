import { describe, expect, it } from "vitest";
import { parseNativeConversationShareOverlayRequest } from "@/lib/native-conversation-share-overlay";

describe("native conversation share overlay requests", () => {
  it("accepts a native conversation-share target and optional trace values", () => {
    expect(parseNativeConversationShareOverlayRequest({
      shareToken: "token-abc123",
      linkNonce: "launch-2",
      navigationSequence: 2,
    })).toEqual({
      shareToken: "token-abc123",
      linkNonce: "launch-2",
      navigationSequence: 2,
    });
  });

  it("keeps the copy-link flag only when it is exactly true", () => {
    expect(parseNativeConversationShareOverlayRequest({
      shareToken: "token-abc123",
      canCopyLink: true,
    })).toEqual({ shareToken: "token-abc123", canCopyLink: true });
    expect(parseNativeConversationShareOverlayRequest({
      shareToken: "token-abc123",
      canCopyLink: "true",
    })).toEqual({ shareToken: "token-abc123" });
  });

  it("rejects malformed or unsafe share tokens", () => {
    expect(parseNativeConversationShareOverlayRequest(null)).toBeNull();
    expect(parseNativeConversationShareOverlayRequest({ shareToken: "not valid" })).toBeNull();
    expect(parseNativeConversationShareOverlayRequest({ shareToken: "https://example.com" })).toBeNull();
  });
});
