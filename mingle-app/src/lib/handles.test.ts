import { describe, expect, it } from "vitest";
import {
  HANDLE_MAX_LENGTH,
  buildDefaultHandle,
  buildDefaultHandleCandidates,
  formatHandle,
  normalizeHandle,
} from "@/lib/handles";

describe("handles", () => {
  it("trims and normalizes valid handles to lowercase", () => {
    expect(normalizeHandle("  Mina.Song_2  ")).toEqual({
      value: "mina.song_2",
      valid: true,
    });
  });

  it("allows only ASCII letters, numbers, underscores, and periods", () => {
    expect(normalizeHandle("mina-song").valid).toBe(false);
    expect(normalizeHandle("미나").valid).toBe(false);
    expect(normalizeHandle(`a`.repeat(HANDLE_MAX_LENGTH + 1)).valid).toBe(false);
  });

  it("treats an empty value as clearing the optional handle", () => {
    expect(normalizeHandle("   ")).toEqual({ value: null, valid: true });
    expect(normalizeHandle(null)).toEqual({ value: null, valid: true });
  });

  it("formats a stored handle with a public at-sign", () => {
    expect(formatHandle("mina.song")).toBe("@mina.song");
    expect(formatHandle(null)).toBe("");
  });

  it("builds a readable default handle from the display name", () => {
    expect(buildDefaultHandle({ name: "  Mina Song  ", email: "mina@example.com" })).toBe("minasong");
  });

  it("falls back to an email or external id when the name has no supported characters", () => {
    expect(buildDefaultHandle({ name: "미나", email: "mina.song@example.com" })).toBe("mina.song");
    expect(buildDefaultHandle({ name: "미나", id: "native_user_123" })).toBe("native_user_123");
  });

  it("provides deterministic collision candidates", () => {
    expect(buildDefaultHandleCandidates({ name: "Mina Song", id: "user_12345678" })).toEqual([
      "minasong",
      "minasong_12345678",
      "user_12345678",
    ]);
  });
});
