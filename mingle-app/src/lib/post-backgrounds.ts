/**
 * Post background presets for the feed.
 * Each preset includes a key, CSS background value, and contrast tokens
 * (text color + optional text shadow) to ensure readability on top.
 */

export type PostBackgroundPreset = {
  key: string;
  /** CSS `background` shorthand value. */
  background: string;
  /** Text color that guarantees contrast on this background. */
  textColor: string;
  /** CSS `text-shadow` value for extra legibility (e.g. over gradients). */
  textShadow: string;
};

const PRESETS: readonly PostBackgroundPreset[] = [
  // ── Solid colors ──
  {
    key: "warm-cream",
    background: "#fdf6ec",
    textColor: "#1e1b18",
    textShadow: "none",
  },
  {
    key: "soft-navy",
    background: "#1e293b",
    textColor: "#f8fafc",
    textShadow: "0 1px 4px rgba(0,0,0,0.4)",
  },
  {
    key: "dusty-rose",
    background: "#f9e4e4",
    textColor: "#3b1c1c",
    textShadow: "none",
  },
  {
    key: "mint-green",
    background: "#d1fae5",
    textColor: "#064e3b",
    textShadow: "none",
  },
  // ── Gradients ──
  {
    key: "sunset-orange",
    // #ea580c (not #f97316): white large text stays >= 3:1 at the light stop.
    background: "linear-gradient(135deg, #ea580c 0%, #ec4899 100%)",
    textColor: "#ffffff",
    textShadow: "0 1px 6px rgba(0,0,0,0.35)",
  },
  {
    key: "ocean-blue",
    // Deepened from #3b82f6 → #06b6d4 (cyan-500 was ~2.4:1 against white).
    background: "linear-gradient(135deg, #2563eb 0%, #0e7490 100%)",
    textColor: "#ffffff",
    textShadow: "0 1px 6px rgba(0,0,0,0.3)",
  },
  {
    key: "aurora-green",
    // #059669 (not #10b981, ~2.5:1) keeps white large text >= 3:1.
    background: "linear-gradient(135deg, #059669 0%, #6366f1 100%)",
    textColor: "#ffffff",
    textShadow: "0 1px 6px rgba(0,0,0,0.3)",
  },
  {
    key: "lavender-mist",
    background: "linear-gradient(135deg, #c4b5fd 0%, #fbcfe8 100%)",
    textColor: "#1e1b4b",
    textShadow: "none",
  },
  {
    key: "golden-hour",
    background: "linear-gradient(135deg, #fbbf24 0%, #f97316 100%)",
    // Dark ink: white on amber #fbbf24 was ~1.7:1.
    textColor: "#431407",
    textShadow: "none",
  },
  {
    key: "midnight-purple",
    background: "linear-gradient(135deg, #312e81 0%, #7c3aed 100%)",
    textColor: "#f5f3ff",
    textShadow: "0 1px 6px rgba(0,0,0,0.4)",
  },
  // ── Patterned / textured ──
  {
    key: "paper-texture",
    // Paper grain: a fine dot grid + faint fibres over the warm paper tone.
    background: [
      "radial-gradient(rgba(120,53,15,0.09) 0.8px, transparent 1.2px) 0 0 / 7px 7px",
      "repeating-linear-gradient(100deg, rgba(120,53,15,0.035) 0 1px, transparent 1px 11px)",
      "linear-gradient(145deg, #fefce8 0%, #fef3c7 50%, #fde68a 100%)",
    ].join(", "),
    textColor: "#451a03",
    textShadow: "none",
  },
  {
    key: "dark-mesh",
    // Mesh: two crossing hairline grids over a soft navy glow.
    background: [
      "repeating-linear-gradient(45deg, rgba(148,163,184,0.08) 0 1px, transparent 1px 18px)",
      "repeating-linear-gradient(-45deg, rgba(148,163,184,0.08) 0 1px, transparent 1px 18px)",
      "radial-gradient(circle at 20% 30%, #1e293b 0%, #0f172a 60%)",
      "#0f172a",
    ].join(", "),
    textColor: "#e2e8f0",
    textShadow: "0 1px 4px rgba(0,0,0,0.5)",
  },
] as const;

const PRESET_MAP = new Map<string, PostBackgroundPreset>(
  PRESETS.map((preset) => [preset.key, preset]),
);

/** All available preset keys. */
export function getBackgroundKeys(): string[] {
  return PRESETS.map((p) => p.key);
}

/** Retrieve a preset by key. Returns `undefined` for unknown keys. */
export function getBackgroundPreset(
  key: string,
): PostBackgroundPreset | undefined {
  return PRESET_MAP.get(key);
}

/**
 * The preset to draw for a stored key. An unknown or missing key (a preset
 * retired from the catalog, a malformed row) falls back to the catalog's first
 * preset, so the feed card, the grid tile and the compose preview always agree.
 */
export function resolveBackgroundPreset(key: string | null | undefined): PostBackgroundPreset {
  return (key ? PRESET_MAP.get(key) : undefined) ?? PRESETS[0];
}

/** Pick a random preset. Uses `Math.random` — not crypto-grade. */
export function getRandomBackgroundPreset(): PostBackgroundPreset {
  const index = Math.floor(Math.random() * PRESETS.length);
  return PRESETS[index];
}

/**
 * Key of a randomly chosen preset, for assigning a background at write time.
 *
 * The server stores only the key; the feed resolves it back to a preset with
 * `getBackgroundPreset`. Both sides must therefore agree on the key set, which
 * is why this lives here rather than in a server-only module.
 */
export function randomBackgroundKey(): string {
  return getRandomBackgroundPreset().key;
}

/** Whether a stored key still maps to a known preset. */
export function isKnownBackgroundKey(key: string): boolean {
  return PRESET_MAP.has(key);
}

/** Total number of presets available. */
export const PRESET_COUNT = PRESETS.length;

/**
 * Tone of the text and icons drawn directly on a post (author row, time,
 * follow, expand/collapse, translate, like/comment/⋯, and the transparent feed
 * header over the active post): `light` = white glyphs, `dark` = dark glyphs.
 *
 * Single source for "which glyph color sits on this post": the feed card, its
 * control slots and the feed header all call this, so they can never disagree.
 * Photo posts are always `light` (glyphs carry a shadow over the image). Text
 * posts follow the preset's own `textColor`, so fixing a preset's contrast in
 * the catalog automatically fixes every overlay drawn on it.
 */
export type PostForegroundTone = "light" | "dark";

/** Glyph color for each tone (single source for card overlays and the header). */
export const POST_FOREGROUND_COLOR: Readonly<Record<PostForegroundTone, string>> = {
  light: "#ffffff",
  dark: "#0f172a",
};

export function postForegroundTone(
  backgroundKey: string | null | undefined,
  hasImage: boolean,
): PostForegroundTone {
  if (hasImage) return "light";
  return isDarkColor(resolveBackgroundPreset(backgroundKey).textColor) ? "dark" : "light";
}

/** True for a dark `#rgb`/`#rrggbb` color (relative luminance below 0.5). */
function isDarkColor(color: string): boolean {
  const hex = color.trim().replace(/^#/, "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return false;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}
