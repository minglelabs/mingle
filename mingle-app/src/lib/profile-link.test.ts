import {
  buildProfileAppUrl,
  buildProfileLinkPath,
  buildProfileLinkUrl,
  parseMingleProfileLink,
} from "@/lib/profile-link";
import { describe, expect, it } from "vitest";

describe("profile links", () => {
  const origin = "https://mingle-2-0-0-production.up.railway.app";

  it("builds stable HTTPS and custom-scheme links from a user ID", () => {
    expect(buildProfileLinkPath("cmg123abc")).toBe("/p/cmg123abc");
    expect(buildProfileLinkUrl(origin, "cmg123abc")).toBe(`${origin}/p/cmg123abc`);
    expect(buildProfileAppUrl("cmg123abc")).toBe("mingle://profile/cmg123abc");
    expect(buildProfileAppUrl("cmg123abc", "launch-1")).toBe("mingle://profile/cmg123abc?linkNonce=launch-1");
  });

  it("accepts only Mingle profile links for the configured origin", () => {
    expect(parseMingleProfileLink(`${origin}/p/cmg123abc`, [origin])).toEqual({
      source: "https",
      userId: "cmg123abc",
    });
    expect(parseMingleProfileLink("https://example.com/p/cmg123abc", [origin])).toBeNull();
    expect(parseMingleProfileLink("mingle://profile/cmg123abc", [origin])).toEqual({
      source: "mingle",
      userId: "cmg123abc",
    });
  });
});
