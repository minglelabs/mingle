import { describe, expect, it } from "vitest";
import {
  getBackgroundKeys,
  getBackgroundPreset,
  getRandomBackgroundPreset,
  PRESET_COUNT,
  type PostBackgroundPreset,
} from "./post-backgrounds";

describe("post-backgrounds", () => {
  it("has at least 12 presets", () => {
    expect(PRESET_COUNT).toBeGreaterThanOrEqual(12);
    expect(getBackgroundKeys().length).toBe(PRESET_COUNT);
  });

  it("every key is unique", () => {
    const keys = getBackgroundKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every preset has required fields", () => {
    for (const key of getBackgroundKeys()) {
      const preset = getBackgroundPreset(key);
      expect(preset).toBeDefined();
      expect(typeof preset!.background).toBe("string");
      expect(preset!.background.length).toBeGreaterThan(0);
      expect(typeof preset!.textColor).toBe("string");
      expect(preset!.textColor.length).toBeGreaterThan(0);
      expect(typeof preset!.textShadow).toBe("string");
    }
  });

  it("getBackgroundPreset returns undefined for unknown key", () => {
    expect(getBackgroundPreset("nonexistent-key")).toBeUndefined();
  });

  it("getRandomBackgroundPreset returns a valid preset", () => {
    const preset = getRandomBackgroundPreset();
    expect(preset).toBeDefined();
    expect(getBackgroundKeys()).toContain(preset.key);
  });

  it("each preset textColor looks like a color value", () => {
    for (const key of getBackgroundKeys()) {
      const preset = getBackgroundPreset(key)!;
      expect(preset.textColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("each preset textShadow is 'none' or a CSS shadow string", () => {
    for (const key of getBackgroundKeys()) {
      const preset = getBackgroundPreset(key)!;
      if (preset.textShadow !== "none") {
        // Very loose check: contains at least one digit (px value or rgb).
        expect(preset.textShadow).toMatch(/\d/);
      }
    }
  });
});
