import { describe, expect, it } from "vitest";
import {
  getBackgroundKeys,
  getBackgroundPreset,
  getRandomBackgroundPreset,
  POST_FOREGROUND_COLOR,
  postForegroundTone,
  PRESET_COUNT,
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

describe("postForegroundTone", () => {
  it("uses dark glyphs on light text-post backgrounds and light glyphs on dark ones", async () => {
    const { postForegroundTone } = await import("./post-backgrounds");
    expect(postForegroundTone("warm-cream", false)).toBe("dark");
    expect(postForegroundTone("lavender-mist", false)).toBe("dark");
    expect(postForegroundTone("soft-navy", false)).toBe("light");
    expect(postForegroundTone("midnight-purple", false)).toBe("light");
  });

  it("always uses light glyphs over a photo and resolves unknown keys like the card does", async () => {
    const { postForegroundTone, resolveBackgroundPreset } = await import("./post-backgrounds");
    expect(postForegroundTone("warm-cream", true)).toBe("light");
    expect(postForegroundTone("no-such-key", false)).toBe(
      postForegroundTone(resolveBackgroundPreset("no-such-key").key, false),
    );
  });
});

// ── Contrast ──────────────────────────────────────────────────────────────
function luminance(hex: string): number {
  const full = hex.replace(/^#/, "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** Every opaque color stop the background can show behind the text. */
function backgroundStops(background: string): string[] {
  return (background.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((c) => c.toLowerCase());
}

describe("post-backgrounds contrast", () => {
  const LARGE_TEXT_MIN = 3;

  it.each(getBackgroundKeys())("%s: body text is >= 3:1 on every color stop", (key) => {
    const preset = getBackgroundPreset(key)!;
    const stops = backgroundStops(preset.background);
    expect(stops.length).toBeGreaterThan(0);
    for (const stop of stops) {
      expect(contrast(preset.textColor, stop), `${key} ${preset.textColor} on ${stop}`).toBeGreaterThanOrEqual(
        LARGE_TEXT_MIN,
      );
    }
  });

  it.each(getBackgroundKeys())("%s: overlay glyph tone is >= 3:1 on every color stop", (key) => {
    const preset = getBackgroundPreset(key)!;
    const glyph = POST_FOREGROUND_COLOR[postForegroundTone(key, false)];
    for (const stop of backgroundStops(preset.background)) {
      expect(contrast(glyph, stop), `${key} glyph ${glyph} on ${stop}`).toBeGreaterThanOrEqual(LARGE_TEXT_MIN);
    }
  });

  it("light backgrounds get dark glyphs, dark backgrounds light glyphs, photos always light", () => {
    for (const key of ["warm-cream", "dusty-rose", "mint-green", "lavender-mist", "paper-texture", "golden-hour"]) {
      expect(postForegroundTone(key, false)).toBe("dark");
      expect(postForegroundTone(key, true)).toBe("light");
    }
    for (const key of ["soft-navy", "sunset-orange", "ocean-blue", "aurora-green", "midnight-purple", "dark-mesh"]) {
      expect(postForegroundTone(key, false)).toBe("light");
    }
    expect(postForegroundTone("unknown-key", false)).toBe(postForegroundTone(getBackgroundKeys()[0], false));
  });

  it("patterned presets draw a real pattern, not a flat gradient", () => {
    for (const key of ["paper-texture", "dark-mesh"]) {
      const bg = getBackgroundPreset(key)!.background;
      expect(bg).toMatch(/repeating-linear-gradient|radial-gradient\(rgba/);
      expect(bg.split(/,\s*(?=[a-z#])/i).length).toBeGreaterThan(2);
    }
  });

  it("keeps every catalog key (stored rows must still resolve)", () => {
    expect(getBackgroundKeys()).toEqual([
      "warm-cream", "soft-navy", "dusty-rose", "mint-green", "sunset-orange", "ocean-blue",
      "aurora-green", "lavender-mist", "golden-hour", "midnight-purple", "paper-texture", "dark-mesh",
    ]);
  });
});
