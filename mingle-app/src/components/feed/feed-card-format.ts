/**
 * Pure presentation rules for a feed card, kept out of the React component so
 * they are unit-tested without a DOM (this repo has no React test renderer).
 */
import { POST_FOREGROUND_COLOR, type PostForegroundTone } from "@/lib/post-backgrounds";
import { generatePreviewText } from "@/lib/post-preview-text";
import { resolveShownText } from "@/components/feed/use-feed-translate";

// ── Shown text ────────────────────────────────────────────────────────────

export type CardTexts = {
  /** Expanded body AND the collapsed image-post snippet. */
  displayText: string;
  /** Collapsed centre preview of a text post. */
  previewText: string;
  previewTruncated: boolean;
};

/**
 * All three places a card shows its body (centre preview, image snippet,
 * expanded body) derive from ONE shown string, so a manual translation or
 * "Show original" switches every one of them together.
 */
export function resolveCardTexts(
  sourceText: string,
  translatedText: string | null,
  showingTranslation: boolean,
): CardTexts {
  const shown = resolveShownText(sourceText, translatedText, showingTranslation);
  const preview = generatePreviewText(shown);
  return { displayText: shown, previewText: preview.text, previewTruncated: preview.isTruncated };
}

// ── Time ──────────────────────────────────────────────────────────────────

/**
 * Locale-aware compact time for the author row: "3분 전" / "3 min. ago" under
 * a week, then a short localized date ("9월 20일", adding the year when it is
 * not the current one).
 */
export function formatPostTime(iso: string, locale: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  const rtf = safeRelativeTimeFormat(locale);
  const rel = (value: number, unit: Intl.RelativeTimeFormatUnit) =>
    rtf ? rtf.format(-value, unit) : `${value}${unit.charAt(0)}`;

  if (diffSec < 60) return rtf ? rtf.format(0, "second") : "0s";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return rel(min, "minute");
  const hr = Math.floor(min / 60);
  if (hr < 24) return rel(hr, "hour");
  const day = Math.floor(hr / 24);
  if (day < 7) return rel(day, "day");

  const date = new Date(then);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  try {
    return date.toLocaleDateString(locale, sameYear
      ? { month: "short", day: "numeric" }
      : { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return date.toLocaleDateString();
  }
}

function safeRelativeTimeFormat(locale: string): Intl.RelativeTimeFormat | null {
  if (typeof Intl === "undefined" || typeof Intl.RelativeTimeFormat !== "function") return null;
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  } catch {
    try {
      return new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" });
    } catch {
      return null;
    }
  }
}

// ── Image ─────────────────────────────────────────────────────────────────

/**
 * CSS `aspect-ratio` for the post image: the DTO's original size when known,
 * else the size measured after load, else null (let the box fill the card).
 */
export function imageAspectRatio(
  dto: { width: number | null; height: number | null } | null | undefined,
  measured?: { width: number; height: number } | null,
): string | null {
  const valid = (w: unknown, h: unknown) =>
    typeof w === "number" && typeof h === "number" && Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
  if (dto && valid(dto.width, dto.height)) return `${dto.width} / ${dto.height}`;
  if (measured && valid(measured.width, measured.height)) return `${measured.width} / ${measured.height}`;
  return null;
}

// ── Expand ────────────────────────────────────────────────────────────────

/**
 * "See more" appears only when something is actually hidden:
 * - text post: the centre preview of the CURRENTLY SHOWN text was cut;
 * - image post: the 3-line clamp of the shown text measurably overflows.
 */
export function shouldShowExpand(args: {
  hasImage: boolean;
  expanded: boolean;
  previewTruncated: boolean;
  clampOverflows: boolean;
}): boolean {
  if (args.expanded) return false;
  return args.hasImage ? args.clampOverflows : args.previewTruncated;
}

// ── Foreground tone ───────────────────────────────────────────────────────

export type ForegroundTokens = {
  /** Tailwind text color + shadow classes for text drawn on the post. */
  textClass: string;
  /** Muted variant (time). */
  mutedTextClass: string;
  /** Stroke color for lucide icons. */
  iconColor: string;
  /** CSS filter for icons (shadow over photos / dark backgrounds). */
  iconFilter: string | undefined;
  /** Chip / avatar-fallback surface. */
  chipClass: string;
};

export function foregroundTokens(tone: PostForegroundTone): ForegroundTokens {
  if (tone === "dark") {
    return {
      textClass: "text-slate-900",
      mutedTextClass: "text-slate-900/70",
      iconColor: POST_FOREGROUND_COLOR.dark,
      iconFilter: undefined,
      chipClass: "bg-slate-900/10 text-slate-900",
    };
  }
  return {
    textClass: "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]",
    mutedTextClass: "text-white/80 drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]",
    iconColor: POST_FOREGROUND_COLOR.light,
    iconFilter: "drop-shadow(0 1px 3px rgba(0,0,0,0.5))",
    chipClass: "bg-white/20 text-white",
  };
}
