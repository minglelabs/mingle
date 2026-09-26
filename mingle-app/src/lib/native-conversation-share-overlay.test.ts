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

  it("rejects malformed or unsafe share tokens", () => {
    expect(parseNativeConversationShareOverlayRequest(null)).toBeNull();
    expect(parseNativeConversationShareOverlayRequest({ shareToken: "not valid" })).toBeNull();
    expect(parseNativeConversationShareOverlayRequest({ shareToken: "https://example.com" })).toBeNull();
  });
});
