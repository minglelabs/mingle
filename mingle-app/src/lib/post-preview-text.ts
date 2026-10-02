/**
 * Post preview text utilities for the feed centre display.
 *
 * The centre preview is drawn in large type (1.5rem) on a phone-width card, so
 * the budget is measured in DISPLAY WIDTH, not characters: a Hangul/CJK/kana
 * character or an emoji is about twice as wide as a Latin letter. One card line
 * holds roughly `LINE_UNITS` narrow units (~12 Hangul characters).
 *
 * - A body that fits in about 2–3 lines is shown whole (`isTruncated: false`).
 * - Otherwise the cut starts from ~20 wide characters (`TARGET_UNITS`) and
 *   snaps to the nearest meaning boundary (sentence end, clause punctuation,
 *   then a space) inside the 1–3 line window, falling back to a hard cut.
 * - Text is split into grapheme clusters (`Intl.Segmenter`), so ZWJ emoji,
 *   flags and combining marks are never broken.
 * - The original body text is never mutated.
 */

/** Narrow units per displayed line at the feed's 1.5rem preview size. */
export const LINE_UNITS = 24;
/** Starting point for the cut: ~20 wide characters. */
export const TARGET_UNITS = 40;
/** Never cut before one full line. */
const MIN_UNITS = LINE_UNITS;
/** Whole-body / cut ceiling: under three lines, leaving room for "…". */
export const MAX_UNITS = LINE_UNITS * 3 - 6;

/** Sentence ends: the cut reads as complete, no ellipsis. */
const SENTENCE_END_RE = /^[.!?。！？…]$/u;
/** Clause punctuation: a natural pause, but the thought continues ("…"). */
const CLAUSE_END_RE = /^[,，、;；:：]$/u;
const WIDE_RE =
  /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303f\uff00-\uffef\p{Extended_Pictographic}\p{Regional_Indicator}]/u;

type SegmenterLike = { segment(input: string): Iterable<{ segment: string }> };

function makeSegmenter(): SegmenterLike | null {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => SegmenterLike })
    .Segmenter;
  if (typeof Seg !== "function") return null;
  try {
    return new Seg(undefined, { granularity: "grapheme" });
  } catch {
    return null;
  }
}

const segmenter = makeSegmenter();

/** Split into user-perceived characters (grapheme clusters). */
export function splitGraphemes(text: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(text), (s) => s.segment);
  return Array.from(text);
}

/** Display width of one grapheme in narrow units (wide scripts / emoji = 2). */
export function graphemeUnits(grapheme: string): number {
  return WIDE_RE.test(grapheme) ? 2 : 1;
}

/**
 * Cumulative display cost after each grapheme. A newline ends the current
 * line, so it costs the rest of that line.
 */
function cumulativeCost(graphemes: string[]): number[] {
  const out: number[] = [];
  let cost = 0;
  for (const g of graphemes) {
    if (g === "\n") {
      const used = cost % LINE_UNITS;
      cost += used === 0 && cost > 0 ? LINE_UNITS : LINE_UNITS - used;
    } else {
      cost += graphemeUnits(g);
    }
    out.push(cost);
  }
  return out;
}

function closestTo(target: number, candidates: { index: number; cost: number }[]) {
  let best: { index: number; cost: number } | null = null;
  for (const c of candidates) {
    if (!best || Math.abs(c.cost - target) < Math.abs(best.cost - target)) best = c;
  }
  return best;
}

/**
 * Produce a preview snippet from the first portion of `bodyText`.
 * Returns `{ text, isTruncated }`.
 */
export function generatePreviewText(bodyText: string): {
  text: string;
  isTruncated: boolean;
} {
  const normalized = bodyText.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { text: "", isTruncated: false };
  }

  const graphemes = splitGraphemes(normalized);
  const cost = cumulativeCost(graphemes);

  if (cost[cost.length - 1] <= MAX_UNITS) {
    return { text: normalized, isTruncated: false };
  }

  const join = (end: number) => graphemes.slice(0, end).join("").trim();

  // 1. Sentence end / line break, then clause punctuation, inside the window.
  const sentence: { index: number; cost: number }[] = [];
  const clause: { index: number; cost: number }[] = [];
  const space: { index: number; cost: number }[] = [];
  for (let i = 0; i < graphemes.length; i++) {
    const g = graphemes[i];
    const c = cost[i];
    if (c > MAX_UNITS) break;
    if (g === "\n") {
      // Cut BEFORE the newline; its cost is the text before it.
      const before = i > 0 ? cost[i - 1] : 0;
      if (before >= MIN_UNITS) sentence.push({ index: i, cost: before });
      continue;
    }
    if (c < MIN_UNITS) continue;
    if (SENTENCE_END_RE.test(g)) sentence.push({ index: i + 1, cost: c });
    else if (CLAUSE_END_RE.test(g)) clause.push({ index: i + 1, cost: c });
    else if (/^\s$/u.test(g) && c <= MAX_UNITS - 2) space.push({ index: i, cost: c });
  }

  const sentenceCut = closestTo(TARGET_UNITS, sentence);
  if (sentenceCut) {
    const text = join(sentenceCut.index);
    if (text) return { text, isTruncated: true };
  }
  const clauseCut = closestTo(TARGET_UNITS, clause);
  if (clauseCut) {
    const text = join(clauseCut.index);
    if (text) return { text: `${text}…`, isTruncated: true };
  }
  const spaceCut = closestTo(TARGET_UNITS, space);
  if (spaceCut) {
    const text = join(spaceCut.index);
    if (text) return { text: `${text}…`, isTruncated: true };
  }

  // 2. Hard cut at the target width (whole graphemes only).
  let end = 0;
  while (end < graphemes.length && cost[end] <= TARGET_UNITS) end++;
  return { text: `${join(Math.max(1, end))}…`, isTruncated: true };
}
