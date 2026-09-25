/**
 * Post preview text utilities for the feed centre display.
 *
 * The visual target is ~20 characters as a starting point, but the actual
 * truncation uses clause/sentence boundaries within 2–3 display lines to
 * produce a readable snippet. The original body text is never mutated.
 */

/** Segmenter-friendly sentence/clause terminators. */
const CLAUSE_END_RE = /[.!?。！？、，\n]/;

/**
 * Maximum grapheme clusters to scan before giving up on finding a clause
 * boundary. Set generously above the ~20-char visual target so that a
 * sentence ending at character 28 is still preferred over a mid-word cut.
 */
const SCAN_LIMIT = 60;

/** Ideal range (inclusive) for character count. */
const IDEAL_MIN = 15;
const IDEAL_MAX = 40;

/**
 * Produce a preview snippet from the first portion of `bodyText`.
 *
 * Returns `{ text, isTruncated }`. When the full body fits within the
 * ideal range it is returned as-is with `isTruncated: false`.
 *
 * Guarantees:
 * - Never returns more than `SCAN_LIMIT` grapheme clusters.
 * - Tries to break at a clause boundary inside `[IDEAL_MIN, IDEAL_MAX]`.
 * - Falls back to a word boundary, then a hard cut with "…".
 * - Handles long single words, emoji, and multiline input.
 * - Strips leading/trailing whitespace and collapses runs of newlines.
 */
export function generatePreviewText(bodyText: string): {
  text: string;
  isTruncated: boolean;
} {
  const normalized = bodyText.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { text: "", isTruncated: false };
  }

  // Spread into grapheme clusters (handles emoji / combining chars).
  const chars = [...normalized];

  if (chars.length <= IDEAL_MAX) {
    return { text: normalized, isTruncated: false };
  }

  // 1. Try clause boundary in [IDEAL_MIN, IDEAL_MAX]
  for (let i = IDEAL_MIN; i <= Math.min(IDEAL_MAX, chars.length - 1); i++) {
    if (CLAUSE_END_RE.test(chars[i])) {
      const candidate = chars.slice(0, i + 1).join("").trim();
      if (candidate.length > 0) {
        return { text: candidate, isTruncated: true };
      }
    }
  }

  // 2. Try word boundary (last space before IDEAL_MAX)
  const scanSlice = chars.slice(0, IDEAL_MAX);
  let lastSpaceIdx = -1;
  for (let i = scanSlice.length - 1; i >= IDEAL_MIN; i--) {
    if (/\s/.test(scanSlice[i])) {
      lastSpaceIdx = i;
      break;
    }
  }

  if (lastSpaceIdx > IDEAL_MIN) {
    const candidate = chars.slice(0, lastSpaceIdx).join("").trim();
    if (candidate.length > 0) {
      return { text: `${candidate}…`, isTruncated: true };
    }
  }

  // 3. Hard cut at IDEAL_MAX
  const hardCut = chars.slice(0, IDEAL_MAX).join("").trim();
  return { text: `${hardCut}…`, isTruncated: true };
}
