import { useSyncExternalStore } from "react";

// Windows ships no country flag glyphs, so "🇰🇷" renders as the letters "KR".
// Detect that once per page by drawing a flag on a 1px canvas: a real flag is
// a color glyph whose pixel does not change with fillStyle; the letter
// fallback is drawn in fillStyle.
const EMOJI_FONT_STACK =
  '"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji","Twemoji Mozilla","Android Emoji",sans-serif';

function drawsAsColorGlyph(text: string): boolean {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return true;
  context.textBaseline = "top";
  context.font = `100px ${EMOJI_FONT_STACK}`;
  context.scale(0.01, 0.01);
  const sample = (fillStyle: string) => {
    context.clearRect(0, 0, 100, 100);
    context.fillStyle = fillStyle;
    context.fillText(text, 0, 0);
    return context.getImageData(0, 0, 1, 1).data.join(",");
  };
  const onWhite = sample("#fff");
  const onBlack = sample("#000");
  return onWhite === onBlack && !onBlack.startsWith("0,0,0,");
}

let cachedNeedsImages: boolean | null = null;

/** True when this browser draws emoji but not country flags (e.g. Windows). */
export function flagEmojiNeedsImages(): boolean {
  if (typeof window === "undefined") return false;
  if (cachedNeedsImages === null) {
    try {
      cachedNeedsImages = drawsAsColorGlyph("\u{1F60A}") && !drawsAsColorGlyph("\u{1F1E8}\u{1F1ED}");
    } catch {
      cachedNeedsImages = false;
    }
  }
  return cachedNeedsImages;
}

const noopSubscribe = () => () => {};

/** Server and first client render use emoji text; images swap in after hydration. */
export function useFlagEmojiNeedsImages(): boolean {
  return useSyncExternalStore(noopSubscribe, flagEmojiNeedsImages, () => false);
}

/**
 * Self-hosted Twemoji SVG for a regional-indicator flag ("🇰🇷" ->
 * /flags/1f1f0-1f1f7.svg), or null for anything else (e.g. "🌐").
 */
export function getFlagEmojiImageSrc(emoji: string): string | null {
  const codePoints = Array.from(emoji.trim(), (char) => char.codePointAt(0) ?? 0);
  if (codePoints.length !== 2) return null;
  if (!codePoints.every((point) => point >= 0x1f1e6 && point <= 0x1f1ff)) return null;
  return `/flags/${codePoints.map((point) => point.toString(16)).join("-")}.svg`;
}
