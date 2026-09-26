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
    background: "linear-gradient(135deg, #f97316 0%, #ec4899 100%)",
    textColor: "#ffffff",
    textShadow: "0 1px 6px rgba(0,0,0,0.35)",
  },
  {
    key: "ocean-blue",
    background: "linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)",
    textColor: "#ffffff",
    textShadow: "0 1px 6px rgba(0,0,0,0.3)",
  },
  {
    key: "aurora-green",
    background: "linear-gradient(135deg, #10b981 0%, #6366f1 100%)",
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
    textColor: "#ffffff",
    textShadow: "0 1px 6px rgba(0,0,0,0.3)",
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
    background: "linear-gradient(145deg, #fefce8 0%, #fef3c7 50%, #fde68a 100%)",
    textColor: "#451a03",
    textShadow: "none",
  },
  {
    key: "dark-mesh",
    background:
      "radial-gradient(circle at 20% 30%, #1e293b 0%, #0f172a 60%), #0f172a",
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
