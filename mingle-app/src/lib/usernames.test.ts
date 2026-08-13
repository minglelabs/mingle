import { describe, expect, it } from "vitest";
import {
  buildDefaultUsername,
  formatUsername,
  normalizeUsername,
  USERNAME_MAX_LENGTH,
} from "@/lib/usernames";

describe("usernames", () => {
  it("trims and normalizes valid usernames to lowercase", () => {
    expect(normalizeUsername("  Mina.Song_2  ")).toEqual({
      value: "mina.song_2",
      valid: true,
    });
  });

  it("allows only ASCII letters, numbers, underscores, and periods", () => {
    expect(normalizeUsername("mina-song").valid).toBe(false);
    expect(normalizeUsername("미나").valid).toBe(false);
    expect(normalizeUsername(`a`.repeat(USERNAME_MAX_LENGTH + 1)).valid).toBe(false);
  });

  it("treats an empty value as clearing the optional username", () => {
    expect(normalizeUsername("   ")).toEqual({ value: null, valid: true });
    expect(normalizeUsername(null)).toEqual({ value: null, valid: true });
  });

  it("formats a stored username with its public at-sign", () => {
    expect(formatUsername("mina.song")).toBe("@mina.song");
    expect(formatUsername(null)).toBe("");
  });

  it("builds a readable default username from the display name", () => {
    expect(buildDefaultUsername({ name: "  Mina Song  ", email: "mina@example.com" })).toBe("minasong");
  });

  it("falls back to an email or external id when the name has no supported characters", () => {
    expect(buildDefaultUsername({ name: "미나", email: "mina.song@example.com" })).toBe("mina.song");
    expect(buildDefaultUsername({ name: "미나", id: "native_user_123" })).toBe("native_user_123");
  });
});
