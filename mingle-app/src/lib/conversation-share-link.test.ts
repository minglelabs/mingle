import {
  buildConversationShareAppUrl,
  buildConversationShareLinkPath,
  buildConversationShareUrl,
  parseMingleConversationShareLink,
} from "@/lib/conversation-share-link";
import { describe, expect, it } from "vitest";

describe("conversation share links", () => {
  const origin = "https://mingle-2-0-0-production.up.railway.app";
  const token = "cmg123abc";

  it("builds stable HTTPS and custom-scheme links from a share token", () => {
    expect(buildConversationShareLinkPath(token)).toBe("/s/cmg123abc");
    expect(buildConversationShareUrl(origin, token)).toBe(`${origin}/s/cmg123abc`);
    expect(buildConversationShareAppUrl(token)).toBe("mingle://conversation-spectate/cmg123abc");
    expect(buildConversationShareAppUrl(token, "launch-1")).toBe("mingle://conversation-spectate/cmg123abc?linkNonce=launch-1");
    expect(buildConversationShareAppUrl(token, "launch-2", "mingleconversation")).toBe("mingleconversation://conversation-spectate/cmg123abc?linkNonce=launch-2");
  });

  it("accepts only Mingle conversation-share links for the configured origin", () => {
    expect(parseMingleConversationShareLink(`${origin}/s/${token}`, [origin])).toEqual({
      source: "https",
      shareToken: token,
    });
    expect(parseMingleConversationShareLink(`https://example.com/s/${token}`, [origin])).toBeNull();
    expect(parseMingleConversationShareLink(`mingle://conversation-spectate/${token}`, [origin])).toEqual({
      source: "mingle",
      shareToken: token,
    });
    expect(parseMingleConversationShareLink(`mingleconversation://conversation-spectate/${token}?linkNonce=launch-2`, [origin])).toEqual({
      source: "mingle",
      shareToken: token,
    });
  });
});
