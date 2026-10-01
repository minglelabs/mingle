// Pure geometry and color math for the photo translation overlay ("lens"
// style, spec §4.4). Boxes come from the shared contract as 0..1 fractions of
// the stored image; everything here works in pixels of a given surface (the
// on-screen stage, or the downscaled sample canvas) so rotation stays
// correct, and returns percentages for placement. No DOM access: text width
// comes from an injected measurer (canvas in the browser, an estimate here).

import type { ConversationImageTextBlock } from '@/lib/conversation-image-text'

export type Size = { width: number; height: number }

/**
 * Boxes are tight around the glyphs; unpadded patches leave 16-24% of lines partly visible (R2 §0).
 * The fraction applies to one line (or column), never to a whole paragraph: padding a
 * 7-line block by 15% of its full height pushed its patch far past the photo.
 */
export const PHOTO_TRANSLATION_PADDING_FRACTION = 0.15
/** A patch never grows by more than this fraction of the photo's shorter side, whatever the line count says. */
export const PHOTO_TRANSLATION_MAX_PADDING_FRACTION = 0.04
/** Past this rotation the axis-aligned box cannot be inverted reliably; paint it unrotated. */
export const PHOTO_TRANSLATION_MAX_ROTATION_DEG = 40
/**
 * Text turned this far or more (sideways labels such as a chart's y axis or a book spine) is
 * a quarter turn: its patch is the box turned by exactly 90 degrees, so the translation reads
 * along the long side instead of shrinking into a tall box.
 */
export const PHOTO_TRANSLATION_QUARTER_TURN_MIN_DEG = 60
export const PHOTO_TRANSLATION_LINE_HEIGHT = 1.2
/** Floor for fitted text; pinch zoom scales the overlay, so small text stays readable. */
export const PHOTO_TRANSLATION_MIN_FONT_PX = 6
/** Blocks whose original line size is within this ratio share one font size. */
export const PHOTO_TRANSLATION_HARMONIZE_TOLERANCE = 0.12
/** Long side of the offscreen canvas used for color sampling. */
export const PHOTO_TRANSLATION_SAMPLE_MAX_PX = 512
export const PHOTO_TRANSLATION_MIN_TEXT_CONTRAST = 3
/** 75th-percentile ring distance (RGB, 0..441) above which the background counts as busy. */
export const PHOTO_TRANSLATION_BUSY_RING_DISTANCE = 28
/** Text pixels must stand this far from the background to count as a text color. */
export const PHOTO_TRANSLATION_MIN_TEXT_DISTANCE = 40
/** Tint strength of the blurred plate used over busy backgrounds. */
export const PHOTO_TRANSLATION_PLATE_ALPHA = 0.62

const DEG = Math.PI / 180

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// ── Stage ────────────────────────────────────────────────────────────────

/**
 * object-fit: contain without upscaling: the largest size with the natural
 * aspect ratio that fits the viewport, never larger than the natural size.
 */
export function containFit(natural: Size, viewport: Size): Size {
  if (!(natural.width > 0 && natural.height > 0 && viewport.width > 0 && viewport.height > 0)) {
    return { width: 0, height: 0 }
  }
  const scale = Math.min(1, viewport.width / natural.width, viewport.height / natural.height)
  return { width: natural.width * scale, height: natural.height * scale }
}

/** Offscreen sampling canvas size: the natural aspect ratio, long side at most `maxPx`. */
export function sampleCanvasSize(natural: Size, maxPx = PHOTO_TRANSLATION_SAMPLE_MAX_PX): Size {
  const longSide = Math.max(natural.width, natural.height)
  if (!(longSide > 0)) return { width: 0, height: 0 }
  const scale = Math.min(1, maxPx / longSide)
  return {
    width: Math.max(1, Math.round(natural.width * scale)),
    height: Math.max(1, Math.round(natural.height * scale)),
  }
}

// ── Block rectangles ─────────────────────────────────────────────────────

export type RotatedSize = { width: number; height: number; angle: number }

/**
 * Recover the rotated text rectangle from the axis-aligned box that encloses
 * it (both in PIXELS): W0 = w cos t + h sin t, H0 = w sin t + h cos t, so
 * w = (W0 cos t - H0 sin t) / (cos^2 t - sin^2 t) and
 * h = (H0 cos t - W0 sin t) / (cos^2 t - sin^2 t) with t = |angle|. Beyond
 * PHOTO_TRANSLATION_MAX_ROTATION_DEG, or when a side comes out non-positive,
 * the box is used unrotated.
 */
export function recoverRotatedSize(boxWidth: number, boxHeight: number, angleDeg: number): RotatedSize {
  const unrotated = { width: boxWidth, height: boxHeight, angle: 0 }
  if (!Number.isFinite(angleDeg) || angleDeg === 0 || Math.abs(angleDeg) > PHOTO_TRANSLATION_MAX_ROTATION_DEG) return unrotated
  const t = Math.abs(angleDeg) * DEG
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  const denominator = cos * cos - sin * sin
  const width = (boxWidth * cos - boxHeight * sin) / denominator
  const height = (boxHeight * cos - boxWidth * sin) / denominator
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) return unrotated
  return { width, height, angle: angleDeg }
}

export type PaintRect = {
  /** Center in surface pixels (the box center; rotation keeps it). */
  cx: number
  cy: number
  /** Painted (padded) size before rotation. */
  width: number
  height: number
  /** Tight text size before padding (recovered for rotated text). */
  textWidth: number
  textHeight: number
  padding: number
  /** Clockwise degrees to rotate around the center; 0 when painted unrotated. */
  angle: number
}

type BlockGeometry = Pick<ConversationImageTextBlock, 'box' | 'angle' | 'vertical'> & { text?: string; lines?: number }

/** A recovered text height below this fraction of width/em is implausible for the text it holds. */
export const PHOTO_TRANSLATION_MIN_PLAUSIBLE_HEIGHT_RATIO = 0.45
/** Typical glyph-box height of a line, in em of its font size. */
const TYPICAL_GLYPH_HEIGHT_EM = 0.85

/**
 * Rotation from the box shape when the model's angle is off: for a rect of
 * aspect `aspect` (w/h) rotated by t, the enclosing box has aspect
 * (aspect cos t + sin t) / (aspect sin t + cos t), which falls from `aspect`
 * at 0 to 1 at 45 degrees, so t is found by bisection. Null when no angle up
 * to PHOTO_TRANSLATION_MAX_ROTATION_DEG produces the box.
 */
export function solveRotatedSizeFromAspect(boxWidth: number, boxHeight: number, aspect: number, sign: number): RotatedSize | null {
  const target = boxWidth / boxHeight
  const enclosing = (t: number) => (aspect * Math.cos(t) + Math.sin(t)) / (aspect * Math.sin(t) + Math.cos(t))
  const max = PHOTO_TRANSLATION_MAX_ROTATION_DEG * DEG
  if (!(aspect > 1 && boxWidth > 0 && boxHeight > 0) || target > aspect || target < enclosing(max)) return null
  let low = 0
  let high = max
  for (let step = 0; step < 40; step += 1) {
    const middle = (low + high) / 2
    if (enclosing(middle) > target) low = middle
    else high = middle
  }
  const t = (low + high) / 2
  const height = boxHeight / (aspect * Math.sin(t) + Math.cos(t))
  const angle = round((sign < 0 ? -t : t) / DEG, 2)
  return height > 0 && angle !== 0 ? { width: aspect * height, height, angle } : null
}

/**
 * The text rectangle inside a block's box, in pixels: the spec's inversion
 * with the model's angle, unless that leaves a line far too thin (or
 * non-positive) for the text it holds. Long lines make the inversion
 * ill-conditioned (at 13 degrees a 1 degree error takes a 26 px line to 7 px),
 * so then the angle is re-solved from the box shape and the text's expected
 * aspect; if that fails too, the box is used unrotated.
 */
function blockTextRect(block: BlockGeometry, boxWidth: number, boxHeight: number): RotatedSize {
  const unrotated = { width: boxWidth, height: boxHeight, angle: 0 }
  if (block.angle && !block.vertical && Math.abs(block.angle) >= PHOTO_TRANSLATION_QUARTER_TURN_MIN_DEG) {
    // Sideways text: its enclosing box is the text rectangle turned by 90 degrees.
    return { width: boxHeight, height: boxWidth, angle: block.angle < 0 ? -90 : 90 }
  }
  if (!block.angle || Math.abs(block.angle) > PHOTO_TRANSLATION_MAX_ROTATION_DEG) return unrotated
  const recovered = recoverRotatedSize(boxWidth, boxHeight, block.angle)
  const textWidthEm = block.text && !block.vertical ? estimateTextWidthEm(block.text.replace(/\s*\n\s*/g, ' ')) : 0
  if (!(textWidthEm > 0)) return recovered
  const plausible = recovered.angle !== 0
    && recovered.height >= PHOTO_TRANSLATION_MIN_PLAUSIBLE_HEIGHT_RATIO * (recovered.width / textWidthEm)
  if (plausible) return recovered
  return solveRotatedSizeFromAspect(boxWidth, boxHeight, textWidthEm / TYPICAL_GLYPH_HEIGHT_EM, Math.sign(block.angle)) ?? unrotated
}

/**
 * Keeps an unrotated (or quarter-turned) patch inside the surface. A tight box that touches the
 * photo's edge padded past it, and the text centered in that patch ended up partly outside the photo.
 */
function clampPaintRect(rect: PaintRect, size: Size): PaintRect {
  const quarter = Math.abs(rect.angle) === 90
  if (rect.angle && !quarter) return rect
  // The region the patch covers on the surface: its enclosing box.
  const coverWidth = quarter ? rect.height : rect.width
  const coverHeight = quarter ? rect.width : rect.height
  const left = Math.max(0, rect.cx - coverWidth / 2)
  const right = Math.min(size.width, rect.cx + coverWidth / 2)
  const top = Math.max(0, rect.cy - coverHeight / 2)
  const bottom = Math.min(size.height, rect.cy + coverHeight / 2)
  if (!(right > left && bottom > top)) return rect
  const width = right - left
  const height = bottom - top
  return {
    ...rect,
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
    width: quarter ? height : width,
    height: quarter ? width : height,
  }
}

/**
 * The patch rectangle of a block on a surface of `size` pixels: the text
 * rectangle (rotation recovered in pixels), padded on every side by 15% of one
 * line's height across the line direction (one column's width for vertical text),
 * then kept inside the surface.
 */
export function blockPaintRect(block: BlockGeometry, size: Size, paddingFraction = PHOTO_TRANSLATION_PADDING_FRACTION): PaintRect {
  const [x0, y0, x1, y1] = block.box
  const boxWidth = (x1 - x0) * size.width
  const boxHeight = (y1 - y0) * size.height
  const rotated = blockTextRect(block, boxWidth, boxHeight)
  const crossSize = block.vertical ? rotated.width : rotated.height
  const lineSize = crossSize / Math.max(1, block.lines ?? 1)
  const padding = Math.min(lineSize * paddingFraction, Math.min(size.width, size.height) * PHOTO_TRANSLATION_MAX_PADDING_FRACTION)
  return clampPaintRect({
    cx: ((x0 + x1) / 2) * size.width,
    cy: ((y0 + y1) / 2) * size.height,
    width: rotated.width + 2 * padding,
    height: rotated.height + 2 * padding,
    textWidth: rotated.width,
    textHeight: rotated.height,
    padding,
    angle: rotated.angle,
  }, size)
}

export type PercentRect = { left: number; top: number; width: number; height: number }

/** Placement as percentages of the surface, so the overlay follows the stage at any size. */
export function toPercentRect(rect: PaintRect, size: Size): PercentRect {
  if (!(size.width > 0 && size.height > 0)) return { left: 0, top: 0, width: 0, height: 0 }
  return {
    left: round(((rect.cx - rect.width / 2) / size.width) * 100, 3),
    top: round(((rect.cy - rect.height / 2) / size.height) * 100, 3),
    width: round((rect.width / size.width) * 100, 3),
    height: round((rect.height / size.height) * 100, 3),
  }
}

/**
 * A vertical source banner translated into a horizontal-writing language
 * needs a horizontal label. Keep that label to the original glyph-column
 * height, and widen it only inside the photo and clear of neighboring OCR
 * boxes. This keeps English words intact without laying a tall black panel
 * over unrelated parts of the photo.
 */
function horizontalLabelRect(
  source: ConversationImageTextBlock,
  blocks: readonly ConversationImageTextBlock[],
  stage: Size,
  rect: PaintRect,
  desiredWidth: number,
): PaintRect {
  if (rect.angle !== 0) return rect

  const centerX = rect.cx
  const centerY = rect.cy
  const labelHeight = rect.width
  const labelTop = centerY - labelHeight / 2
  const labelBottom = centerY + labelHeight / 2
  const edgeGap = 4
  const neighborGap = Math.max(2, rect.padding)
  let leftBound = edgeGap
  let rightBound = stage.width - edgeGap

  for (const block of blocks) {
    if (block.id === source.id) continue
    const neighbor = blockPaintRect(block, stage)
    const radians = Math.abs(neighbor.angle) * DEG
    const halfWidth = (Math.abs(Math.cos(radians)) * neighbor.width + Math.abs(Math.sin(radians)) * neighbor.height) / 2
    const halfHeight = (Math.abs(Math.sin(radians)) * neighbor.width + Math.abs(Math.cos(radians)) * neighbor.height) / 2
    const neighborTop = neighbor.cy - halfHeight
    const neighborBottom = neighbor.cy + halfHeight
    if (neighborBottom <= labelTop || neighborTop >= labelBottom) continue

    const neighborLeft = neighbor.cx - halfWidth
    const neighborRight = neighbor.cx + halfWidth
    if (neighborRight <= centerX) leftBound = Math.max(leftBound, neighborRight + neighborGap)
    else if (neighborLeft >= centerX) rightBound = Math.min(rightBound, neighborLeft - neighborGap)
    else return rect
  }

  const symmetricWidth = Math.max(0, 2 * Math.min(centerX - leftBound, rightBound - centerX))
  if (symmetricWidth < rect.width) return rect
  const width = Math.max(rect.width, Math.min(desiredWidth, symmetricWidth))
  if (width <= rect.width) return rect

  return {
    ...rect,
    width,
    height: labelHeight,
    textWidth: Math.max(1, width - 2 * rect.padding),
    textHeight: rect.textWidth,
  }
}

/** Half the width and height of the axis-aligned box that encloses a (possibly rotated) patch. */
function enclosingHalfSize(rect: PaintRect): { halfWidth: number; halfHeight: number } {
  const radians = Math.abs(rect.angle) * DEG
  return {
    halfWidth: (Math.abs(Math.cos(radians)) * rect.width + Math.abs(Math.sin(radians)) * rect.height) / 2,
    halfHeight: (Math.abs(Math.sin(radians)) * rect.width + Math.abs(Math.cos(radians)) * rect.height) / 2,
  }
}

/** A neighbor must share at least this much of a patch's height to count as being in its row. */
const ROW_SHARE_OF_HEIGHT = 0.25

/**
 * Free room (px) to the left and right of a patch inside its text row: up to the nearest other
 * block's patch that shares the row, else the photo edge, less a small gap. A block that sits over
 * the patch's center leaves no room. This is how a one-line translation that is longer than the
 * original ("된장찌개" -> "Soybean Paste Stew") can borrow the empty space beside it, without pixels.
 */
export function resolveRowRoom(
  rect: PaintRect,
  selfId: string,
  neighbors: readonly { id: string; rect: PaintRect }[],
  stage: Size,
): { left: number; right: number } {
  const top = rect.cy - rect.height / 2
  const bottom = rect.cy + rect.height / 2
  const gap = Math.max(2, rect.padding)
  let leftBound = 0
  let rightBound = stage.width
  for (const neighbor of neighbors) {
    if (neighbor.id === selfId) continue
    const { halfWidth, halfHeight } = enclosingHalfSize(neighbor.rect)
    const shared = Math.min(bottom, neighbor.rect.cy + halfHeight) - Math.max(top, neighbor.rect.cy - halfHeight)
    if (shared < ROW_SHARE_OF_HEIGHT * rect.height) continue
    const neighborLeft = neighbor.rect.cx - halfWidth
    const neighborRight = neighbor.rect.cx + halfWidth
    if (neighborRight <= rect.cx) leftBound = Math.max(leftBound, neighborRight)
    else if (neighborLeft >= rect.cx) rightBound = Math.min(rightBound, neighborLeft)
    else return { left: 0, right: 0 }
  }
  return {
    left: Math.max(0, rect.cx - rect.width / 2 - leftBound - gap),
    right: Math.max(0, rightBound - (rect.cx + rect.width / 2) - gap),
  }
}

// ── Text fitting ─────────────────────────────────────────────────────────

/** Width of `text` in em at the given weight. */
export type TextMeasurer = (text: string, bold: boolean) => number

const WIDE_CHARACTER = /[\u1100-\u11ff\u2e80-\u303f\u3040-\u30ff\u3100-\u31ff\u3200-\u9fff\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/u
const BREAK_ANYWHERE_CHARACTER = /[\u2e80-\u303f\u3040-\u30ff\u3100-\u31ff\u3200-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60]/u
const HANGUL_CHARACTER = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u

function characterWidthEm(character: string): number {
  if (character === ' ') return 0.28
  if (WIDE_CHARACTER.test(character)) return 1
  if (/[ijlI.,:;!|'`]/.test(character)) return 0.28
  if (/[ftr()[\]{}\-"]/.test(character)) return 0.36
  if (/[mwMW@%]/.test(character)) return 0.86
  if (/[A-Z]/.test(character)) return 0.66
  if (/[0-9]/.test(character)) return 0.56
  if (character.codePointAt(0)! > 0xffff) return 1
  return 0.54
}

/** Glyph-class width estimate; the browser uses canvas measureText instead. */
export function estimateTextWidthEm(text: string, bold = false): number {
  let width = 0
  for (const character of text) width += characterWidthEm(character)
  return width * (bold ? 1.06 : 1)
}

type WrapSegment = { text: string; spaceBefore: boolean }

/**
 * Break opportunities as the browser sees them: spaces, plus every character
 * of Chinese/Japanese text. Korean breaks at spaces only (`word-break:
 * keep-all` is set for Korean targets).
 */
function segmentLine(line: string): WrapSegment[] {
  const segments: WrapSegment[] = []
  let word = ''
  let spaceBefore = false
  const flush = () => {
    if (word) segments.push({ text: word, spaceBefore })
    word = ''
    spaceBefore = false
  }
  for (const character of line) {
    if (/\s/.test(character)) {
      flush()
      spaceBefore = segments.length > 0
      continue
    }
    if (BREAK_ANYWHERE_CHARACTER.test(character) && !HANGUL_CHARACTER.test(character)) {
      const hadSpace = spaceBefore
      flush()
      segments.push({ text: character, spaceBefore: hadSpace })
      continue
    }
    word += character
  }
  flush()
  return segments
}

/**
 * How many lines `text` needs at a line width of `maxWidthEm`. Hard breaks
 * ("\n") are kept. A word wider than a line either breaks by character
 * (`breakWords`, like overflow-wrap:anywhere) or makes the width unusable
 * (returns Infinity).
 */
export function wrapLineCount(text: string, maxWidthEm: number, {
  bold = false,
  breakWords = false,
  measure = estimateTextWidthEm,
}: { bold?: boolean; breakWords?: boolean; measure?: TextMeasurer } = {}): number {
  if (!(maxWidthEm > 0)) return Infinity
  const spaceWidth = measure(' ', bold)
  let lines = 0
  for (const line of text.split('\n')) {
    lines += 1
    let lineWidth = 0
    for (const segment of segmentLine(line)) {
      const segmentWidth = measure(segment.text, bold)
      const gap = segment.spaceBefore && lineWidth > 0 ? spaceWidth : 0
      if (lineWidth + gap + segmentWidth <= maxWidthEm) {
        lineWidth += gap + segmentWidth
        continue
      }
      if (lineWidth > 0) {
        lines += 1
        lineWidth = 0
      }
      if (segmentWidth <= maxWidthEm) {
        lineWidth = segmentWidth
        continue
      }
      if (!breakWords) return Infinity
      for (const character of segment.text) {
        const characterWidth = measure(character, bold)
        if (lineWidth > 0 && lineWidth + characterWidth > maxWidthEm) {
          lines += 1
          lineWidth = 0
        }
        lineWidth += characterWidth
      }
    }
  }
  return lines
}

/**
 * Upright vertical advance per character in em, spaces included: measured in
 * Chrome with the app font stack (1.19 em for Hangul, kana, kanji, Latin and a
 * space alike), not the 1 em a horizontal CJK glyph takes.
 */
export const PHOTO_TRANSLATION_VERTICAL_ADVANCE_EM = 1.2

/**
 * A whole word may overflow its line by this fraction at the smallest size
 * before words are broken by character ("Special" in a narrow banner reads
 * better slightly wide than as "Sp/eci/al").
 */
export const PHOTO_TRANSLATION_WORD_OVERFLOW_TOLERANCE = 0.2

/** Width in em of the widest unbreakable segment of `text`. */
export function widestWordEm(text: string, { bold = false, measure = estimateTextWidthEm }: { bold?: boolean; measure?: TextMeasurer } = {}): number {
  let widest = 0
  for (const line of text.split('\n')) {
    for (const segment of segmentLine(line)) widest = Math.max(widest, measure(segment.text, bold))
  }
  return widest
}

const verticalAdvance: TextMeasurer = text => [...text].length * PHOTO_TRANSLATION_VERTICAL_ADVANCE_EM

/** Columns upright vertical text needs in a column `columnHeightEm` tall, with the same break rules as lines. */
export function verticalColumnCount(text: string, columnHeightEm: number): number {
  if (!(columnHeightEm >= PHOTO_TRANSLATION_VERTICAL_ADVANCE_EM)) return Infinity
  return wrapLineCount(text, columnHeightEm, { breakWords: true, measure: verticalAdvance })
}

export type PhotoTranslationFitMode = 'single' | 'wrap' | 'vertical'

export type FitInput = {
  text: string
  mode: PhotoTranslationFitMode
  /** The original block's line (or column) count. */
  lines: number
  /** Padded patch size in pixels. */
  width: number
  height: number
  padding: number
  bold?: boolean
  breakWords?: boolean
  measure?: TextMeasurer
}

function largestFitting(maxFont: number, fits: (fontSize: number) => boolean): number {
  if (!(maxFont > 0)) return PHOTO_TRANSLATION_MIN_FONT_PX
  if (fits(maxFont)) return maxFont
  let low = Math.min(PHOTO_TRANSLATION_MIN_FONT_PX, maxFont)
  let high = maxFont
  if (!fits(low)) return low
  for (let step = 0; step < 16; step += 1) {
    const middle = (low + high) / 2
    if (fits(middle)) low = middle
    else high = middle
  }
  return low
}

/**
 * The largest font size (px) that fits the patch. Text keeps half of the
 * padding as a side margin; the line height adds its own leading.
 * - single: one line (line breaks become spaces), limited by height and width
 * - wrap: wraps into the width, never larger than the original per-line size
 * - vertical: upright top-to-bottom columns, right to left
 */
export function fitFontSize({ text, mode, lines, width, height, padding, bold = false, breakWords = false, measure = estimateTextWidthEm }: FitInput): number {
  const lineCount = Math.max(1, lines)
  let fitted: number
  if (mode === 'vertical') {
    const columnHeight = Math.max(1, height - padding)
    fitted = largestFitting(width / (lineCount * PHOTO_TRANSLATION_LINE_HEIGHT), fontSize =>
      verticalColumnCount(text, columnHeight / fontSize) * fontSize * PHOTO_TRANSLATION_LINE_HEIGHT <= width + 0.01)
  } else {
    const fitWidth = Math.max(1, width - padding)
    if (mode === 'single') {
      const textWidthEm = measure(text.replace(/\s*\n\s*/g, ' ').trim(), bold)
      const byHeight = height / PHOTO_TRANSLATION_LINE_HEIGHT
      fitted = textWidthEm > 0 ? Math.min(byHeight, fitWidth / textWidthEm) : byHeight
    } else {
      fitted = largestFitting(height / (lineCount * PHOTO_TRANSLATION_LINE_HEIGHT), fontSize =>
        wrapLineCount(text, fitWidth / fontSize, { bold, breakWords, measure }) * fontSize * PHOTO_TRANSLATION_LINE_HEIGHT <= height + 0.01)
    }
  }
  return round(Math.max(PHOTO_TRANSLATION_MIN_FONT_PX, fitted))
}

export type HarmonizeItem = { id: string; lineSize: number; fontSize: number; group: string }

/**
 * Blocks of one group whose original line size is within `tolerance` of the
 * smallest line in their cluster share the smallest fitted size, so similar
 * menu items render at one size instead of each fitting its own box.
 */
export function harmonizeFontSizes(items: readonly HarmonizeItem[], tolerance = PHOTO_TRANSLATION_HARMONIZE_TOLERANCE): Map<string, number> {
  const output = new Map<string, number>()
  const groups = new Map<string, HarmonizeItem[]>()
  for (const item of items) groups.set(item.group, [...(groups.get(item.group) ?? []), item])
  for (const members of groups.values()) {
    const sorted = [...members].sort((left, right) => left.lineSize - right.lineSize)
    let cluster: HarmonizeItem[] = []
    const close = () => {
      const size = Math.min(...cluster.map(item => item.fontSize))
      for (const item of cluster) output.set(item.id, size)
      cluster = []
    }
    for (const item of sorted) {
      if (cluster.length && item.lineSize > cluster[0].lineSize * (1 + tolerance)) close()
      cluster.push(item)
    }
    if (cluster.length) close()
  }
  return output
}

/** Targets that can be written top-to-bottom (upright CJK). */
export function isVerticalWritingLanguage(language: string | null | undefined): boolean {
  return language === 'ko' || language === 'ja' || language === 'zh' || language === 'zh-CN' || language === 'zh-TW'
}

// ── Wrapped paragraphs ───────────────────────────────────────────────────

/** Lines of at least this many em (a sentence, not a label) can be the wraps of a paragraph. */
export const PHOTO_TRANSLATION_PARAGRAPH_MIN_LINE_EM = 8
/** In a wrapped paragraph every line but the last fills at least this share of the widest line. */
export const PHOTO_TRANSLATION_PARAGRAPH_FILL = 0.68

/**
 * Whether the line breaks of a block's original text are only where the photo wrapped a
 * paragraph (long lines of about the same width), as opposed to a list, an address or a
 * poster whose lines are separate on purpose.
 */
export function isWrappedParagraph(sourceText: string, measure: TextMeasurer = estimateTextWidthEm, bold = false): boolean {
  const lines = sourceText.split('\n').map(line => line.trim()).filter(Boolean)
  if (lines.length < 2) return false
  const widths = lines.map(line => measure(line, bold))
  const widest = Math.max(...widths)
  const body = widths.slice(0, -1)
  return Math.min(...body) >= PHOTO_TRANSLATION_PARAGRAPH_FILL * widest
    && body.reduce((sum, width) => sum + width, 0) / body.length >= PHOTO_TRANSLATION_PARAGRAPH_MIN_LINE_EM
}

const JOIN_WITHOUT_SPACE = /[\u2e80-\u303f\u3040-\u30ff\u3100-\u31ff\u3200-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60]/u

/**
 * A translated paragraph as running text: the model keeps the photo's line breaks, which
 * fall in the wrong places in another language ("...그렇지" / "않음을" / "보여줍니다."). The
 * browser wraps it again inside the patch. Chinese and Japanese join without a space.
 */
export function reflowWrappedText(text: string): string {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
  let output = lines[0] ?? ''
  for (const line of lines.slice(1)) {
    const joinTight = JOIN_WITHOUT_SPACE.test(output.slice(-1)) && JOIN_WITHOUT_SPACE.test(line[0])
    output += (joinTight ? '' : ' ') + line
  }
  return output
}

// ── Room for longer translations ─────────────────────────────────────────

export type PhotoTranslationTextAlign = 'left' | 'center' | 'right'

/** Block edges within this fraction of the photo width count as aligned. */
export const PHOTO_TRANSLATION_ALIGN_TOLERANCE = 0.012
/** One sibling alone proves an alignment only when its edge is this close. */
export const PHOTO_TRANSLATION_ALIGN_TIGHT_TOLERANCE = 0.004
/** A patch grows at most this many times its own width into free space. */
export const PHOTO_TRANSLATION_MAX_GROWTH = 3
/**
 * Growth stops at the first column that differs from the patch color by more
 * than this (RGB): other text, a price, a chip or card edge. A flat patch
 * grown over a different color would show.
 */
export const PHOTO_TRANSLATION_GROWTH_COLOR_DISTANCE = 24

function alignedEdge(box: ConversationImageTextBlock['box'], align: PhotoTranslationTextAlign): number {
  return align === 'left' ? box[0] : align === 'right' ? box[2] : (box[0] + box[2]) / 2
}

/**
 * Only blocks within this many line heights above or below a block can vouch for its
 * alignment: a column of legend entries or a pair of credit lines are siblings, but a title
 * that happens to end where a footnote at the other end of the photo ends is not.
 */
export const PHOTO_TRANSLATION_ALIGN_NEIGHBOR_LINES = 3

type AlignmentBlock = Pick<ConversationImageTextBlock, 'id' | 'box' | 'angle' | 'vertical'> & Partial<Pick<ConversationImageTextBlock, 'lines' | 'sourceLanguage' | 'align'>>

const RIGHT_TO_LEFT_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur'])

/** Height of one text line as a fraction of the photo height. */
function lineHeightFraction(block: AlignmentBlock): number {
  return (block.box[3] - block.box[1]) / Math.max(1, block.lines ?? 1)
}

function verticalGapFraction(first: AlignmentBlock, second: AlignmentBlock): number {
  return Math.max(0, Math.max(first.box[1], second.box[1]) - Math.min(first.box[3], second.box[3]))
}

/** With no sibling to learn from: a lone line is centered in its patch, a paragraph starts at the reading edge. */
function defaultAlignment(block: AlignmentBlock): PhotoTranslationTextAlign {
  if ((block.lines ?? 1) < 2) return 'center'
  return RIGHT_TO_LEFT_LANGUAGES.has((block.sourceLanguage ?? '').split('-')[0]) ? 'right' : 'left'
}

/**
 * How each block's text is aligned in the photo: what the OCR model read from the photo when it
 * said (align), otherwise from its siblings: the edge
 * (left, center or right) that the most nearby blocks share, as a column of
 * menu items shares left edges and a price column right edges. Nearby means
 * within PHOTO_TRANSLATION_ALIGN_NEIGHBOR_LINES line heights vertically. An edge
 * counts with two or more siblings, or one very close sibling; ties go to the
 * tightest edge; a paragraph needs two (one coincidence proves nothing for it). Rotated and
 * vertical text is centered; anything else falls back to defaultAlignment.
 */
export function inferBlockAlignments(blocks: readonly AlignmentBlock[]): Map<string, PhotoTranslationTextAlign> {
  const output = new Map<string, PhotoTranslationTextAlign>()
  const horizontal = blocks.filter(block => !block.vertical && !block.angle)
  for (const block of blocks) {
    if (block.vertical || block.angle) {
      output.set(block.id, 'center')
      continue
    }
    if (block.align) {
      output.set(block.id, block.align)
      continue
    }
    const siblings = horizontal.filter(other => other.id !== block.id
      && verticalGapFraction(block, other) <= PHOTO_TRANSLATION_ALIGN_NEIGHBOR_LINES * Math.max(lineHeightFraction(block), lineHeightFraction(other)) + 1e-9)
    const candidates = (['left', 'center', 'right'] as const).map(align => {
      const edge = alignedEdge(block.box, align)
      const deviations = siblings
        .map(other => Math.abs(alignedEdge(other.box, align) - edge))
        .filter(deviation => deviation <= PHOTO_TRANSLATION_ALIGN_TOLERANCE)
      return { align, count: deviations.length, spread: deviations.reduce((sum, value) => sum + value, 0), tight: deviations.some(value => value <= PHOTO_TRANSLATION_ALIGN_TIGHT_TOLERANCE) }
    }).filter(candidate => candidate.count >= 2 || (candidate.tight && (block.lines ?? 1) < 2))
      .sort((first, second) => second.count - first.count || first.spread - second.spread)
    output.set(block.id, candidates[0]?.align ?? defaultAlignment(block))
  }
  return output
}

export type FreeSpan = { left: number; right: number }

/**
 * Free background beside each unrotated block, as fractions of the photo
 * width: scanning outward from the padded patch in the downscaled photo, the
 * space ends at the first column whose pixels depart from the block's patch
 * color (other text, prices, graphics, a chip or card edge) or at another
 * block's patch, less one padding of gap. Only flat patches get room; a busy
 * background or a missing sample gets none, so a patch never covers
 * something it cannot see.
 */
export function resolveFreeSpans(
  blocks: readonly ConversationImageTextBlock[],
  image: SampleImage | null,
  paints: ReadonlyMap<string, PhotoTranslationPaint>,
): Map<string, FreeSpan> {
  const output = new Map<string, FreeSpan>()
  if (!image || !(image.width > 0 && image.height > 0)) return output
  const rects = new Map(blocks.map(block => [block.id, blockPaintRect(block, image)]))
  for (const block of blocks) {
    const rect = rects.get(block.id)!
    const paint = paints.get(block.id)
    if (rect.angle || paint?.kind !== 'flat') continue
    const top = Math.max(0, Math.floor(rect.cy - rect.height / 2))
    const bottom = Math.min(image.height - 1, Math.ceil(rect.cy + rect.height / 2))
    // JPEG noise and a stray anti-aliased pixel are not an edge.
    const allowedOff = Math.max(1, Math.floor((bottom - top + 1) * 0.05))
    const leftEdge = rect.cx - rect.width / 2
    const rightEdge = rect.cx + rect.width / 2
    const obstacles = blocks.filter(other => other.id !== block.id).map(other => rects.get(other.id)!)
      .filter(other => other.cy + other.height / 2 > top && other.cy - other.height / 2 < bottom)
    const blocked = (x: number) => {
      if (x < 0 || x >= image.width) return true
      if (obstacles.some(other => x >= other.cx - other.width / 2 && x <= other.cx + other.width / 2)) return true
      let off = 0
      for (let y = top; y <= bottom; y += 1) {
        const pixel = readPixel(image, x, y)
        if (pixel && colorDistance(pixel, paint.background) > PHOTO_TRANSLATION_GROWTH_COLOR_DISTANCE && ++off > allowedOff) return true
      }
      return false
    }
    const limit = rect.width * PHOTO_TRANSLATION_MAX_GROWTH
    let right = 0
    while (right < limit && !blocked(Math.ceil(rightEdge) + right)) right += 1
    let left = 0
    while (left < limit && !blocked(Math.floor(leftEdge) - 1 - left)) left += 1
    output.set(block.id, {
      left: Math.max(0, left - rect.padding) / image.width,
      right: Math.max(0, right - rect.padding) / image.width,
    })
  }
  return output
}

export type PhotoTranslationBlockLayout = {
  id: string
  rect: PercentRect
  angle: number
  mode: PhotoTranslationFitMode
  /** Where the text sits in its patch, following the photo's own alignment. */
  align: PhotoTranslationTextAlign
  fontSize: number
  /** Allow breaking inside words (only when whole words cannot fit). */
  breakWords: boolean
  /** Korean targets wrap at spaces only. */
  keepAll: boolean
  bold: boolean
  text: string
  /** Side margin of the text along its lines (half the padding), px. */
  inset: number
  /** Feather (box-shadow blur), corner radius and plate blur in stage pixels. */
  feather: number
  radius: number
  blur: number
}

/**
 * Everything the overlay needs to paint `language` on a stage of `stage`
 * pixels: patch placement, rotation, the fitting mode and a harmonized font
 * size per block. A single-line translation longer than its box first grows
 * its patch into free background (`freeSpans`, verified in the pixels) along
 * the photo's alignment, so "김치찌개" -> "Kimchi Stew" keeps a readable size
 * instead of shrinking to fit the original width.
 */
export function layoutPhotoTranslationBlocks({ items, stage, language, measure = estimateTextWidthEm, alignments, freeSpans, sourceBlocks, inlinePaddingPx }: {
  items: readonly { block: ConversationImageTextBlock; text: string }[]
  stage: Size
  language: string
  measure?: TextMeasurer
  alignments?: ReadonlyMap<string, PhotoTranslationTextAlign>
  freeSpans?: ReadonlyMap<string, FreeSpan>
  /** All OCR boxes, including blocks that are not currently painted. */
  sourceBlocks?: readonly ConversationImageTextBlock[]
  /** Fixed CSS inline padding for labels; omitted keeps the photo-proportional inset. */
  inlinePaddingPx?: number
}): PhotoTranslationBlockLayout[] {
  if (!(stage.width > 0 && stage.height > 0)) return []
  const inlineInset = typeof inlinePaddingPx === 'number' && Number.isFinite(inlinePaddingPx)
    ? Math.max(0, inlinePaddingPx)
    : null
  const keepAll = language === 'ko'
  const vertical = isVerticalWritingLanguage(language)
  let rowNeighbors: { id: string; rect: PaintRect }[] | null = null
  const neighborRects = () => (rowNeighbors ??= (sourceBlocks ?? items.map(item => item.block))
    .map(other => ({ id: other.id, rect: blockPaintRect(other, stage) })))
  const drafts = items.map(({ block, text }) => {
    let rect = blockPaintRect(block, stage)
    const fitPadding = inlineInset === null ? rect.padding : inlineInset * 2
    const mode: PhotoTranslationFitMode = block.vertical
      ? vertical ? 'vertical' : 'wrap'
      : block.lines > 1 ? 'wrap' : 'single'
    const align = mode === 'vertical' ? 'center' : alignments?.get(block.id) ?? 'center'
    const bold = block.style?.bold === true
    const shown = mode === 'single'
      ? text.replace(/\s*\n\s*/g, ' ').trim()
      : mode === 'wrap' && !block.vertical && isWrappedParagraph(block.text, measure, bold) ? reflowWrappedText(text) : text
    const span = freeSpans?.get(block.id)
    // Growable: one-line text (aiming at the box's line size) and vertical
    // banners written across (aiming at the column's glyph size for the widest word).
    const across = mode === 'wrap' && block.vertical === true
    if (across) {
      const blocks = sourceBlocks ?? items.map(item => item.block)
      const desiredWidth = measure(shown.replace(/\s*\n\s*/g, ' ').trim(), bold)
        * (rect.textWidth / PHOTO_TRANSLATION_LINE_HEIGHT) + fitPadding
      rect = horizontalLabelRect(block, blocks, stage, rect, desiredWidth)
    }
    if (!rect.angle && mode === 'single') {
      const needed = measure(shown, bold) * (rect.height / PHOTO_TRANSLATION_LINE_HEIGHT) + fitPadding - rect.width
      if (needed > 0) {
        // Verified free background when the caller sampled the pixels, else the row between neighbors.
        const room = span
          ? { left: span.left * stage.width, right: span.right * stage.width }
          : resolveRowRoom(rect, block.id, neighborRects(), stage)
        const limit = rect.width * PHOTO_TRANSLATION_MAX_GROWTH
        const leftRoom = Math.min(room.left, limit)
        const rightRoom = Math.min(room.right, limit)
        let growLeft = 0
        let growRight = 0
        if (align === 'left') growRight = Math.min(needed, rightRoom)
        else if (align === 'right') growLeft = Math.min(needed, leftRoom)
        else {
          // Centered: grow evenly, then let the side with room take the rest
          // (a label against the photo edge grows inward).
          growLeft = Math.min(needed / 2, leftRoom)
          growRight = Math.min(needed / 2, rightRoom)
          const rest = needed - growLeft - growRight
          const extraLeft = Math.min(rest, leftRoom - growLeft)
          growLeft += extraLeft
          growRight += Math.min(rest - extraLeft, rightRoom - growRight)
        }
        rect = { ...rect, width: rect.width + growLeft + growRight, cx: rect.cx + (growRight - growLeft) / 2 }
      }
    }
    const fit = { text: shown, mode, lines: block.lines, width: rect.width, height: rect.height, padding: fitPadding, bold, measure }
    // Upright columns may break anywhere (as the column estimate does).
    let breakWords = mode === 'vertical'
    let fontSize = fitFontSize({ ...fit, breakWords })
    if (mode === 'wrap' && !Number.isFinite(wrapLineCount(shown, (rect.width - fitPadding) / fontSize, { bold, measure }))
      && widestWordEm(shown, { bold, measure }) * fontSize > (rect.width - fitPadding) * (1 + PHOTO_TRANSLATION_WORD_OVERFLOW_TOLERANCE)) {
      // Whole words do not fit even at the smallest size: break inside words
      // (overflow-wrap:anywhere) rather than spill far past the patch.
      breakWords = true
      fontSize = fitFontSize({ ...fit, breakWords: true })
    }
    const crossSize = across ? rect.textHeight : block.vertical ? rect.textWidth : rect.textHeight
    return {
      id: block.id,
      rect,
      mode,
      align,
      bold,
      text: shown,
      breakWords,
      fontSize,
      lineSize: crossSize / Math.max(1, block.lines),
      // By the source orientation: a vertical banner written across (non-CJK
      // targets) must not shrink a horizontal heading of similar size.
      group: block.vertical ? 'vertical' : 'horizontal',
    }
  })
  const harmonized = harmonizeFontSizes(drafts)
  return drafts.map(draft => ({
    id: draft.id,
    rect: toPercentRect(draft.rect, stage),
    angle: draft.rect.angle,
    mode: draft.mode,
    align: draft.align,
    fontSize: harmonized.get(draft.id) ?? draft.fontSize,
    breakWords: draft.breakWords,
    keepAll,
    bold: draft.bold,
    text: draft.text,
    inset: round(inlineInset ?? draft.rect.padding / 2),
    feather: round(clamp(draft.rect.padding * 0.9, 1, 14)),
    radius: round(Math.min(draft.rect.padding * 1.2, draft.rect.height / 2)),
    blur: round(Math.max(3, draft.rect.textHeight * 0.3)),
  }))
}

// ── Colors ───────────────────────────────────────────────────────────────

export type Rgb = { r: number; g: number; b: number }
/** RGBA pixels of the downscaled photo (ImageData-like). */
export type SampleImage = { width: number; height: number; data: ArrayLike<number> }

export type PhotoTranslationPaintKind = 'flat' | 'plate' | 'hint' | 'scrim'
export type PhotoTranslationPaint = { kind: PhotoTranslationPaintKind; background: Rgb; alpha: number; text: Rgb }

export const PHOTO_TRANSLATION_NEAR_BLACK: Rgb = { r: 17, g: 24, b: 39 }
export const PHOTO_TRANSLATION_WHITE: Rgb = { r: 255, g: 255, b: 255 }
/** Last-resort look: a dark scrim with white text. */
export const PHOTO_TRANSLATION_SCRIM: PhotoTranslationPaint = {
  kind: 'scrim',
  background: { r: 15, g: 23, b: 42 },
  alpha: 0.72,
  text: PHOTO_TRANSLATION_WHITE,
}

export function parseHexColor(value: string | null | undefined): Rgb | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value ?? '')
  if (!match) return null
  return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) }
}

export function cssColor({ r, g, b }: Rgb, alpha = 1): string {
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function channelLuminance(value: number): number {
  const channel = value / 255
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance, 0..1. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

/** WCAG contrast ratio, 1..21. */
export function contrastRatio(first: Rgb, second: Rgb): number {
  const a = relativeLuminance(first)
  const b = relativeLuminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * The sampled (or hinted) text color when it contrasts at least 3:1 with the
 * patch; otherwise near-black or white, whichever contrasts more.
 */
export function chooseTextColor(candidate: Rgb | null, background: Rgb, minContrast = PHOTO_TRANSLATION_MIN_TEXT_CONTRAST): Rgb {
  if (candidate && contrastRatio(candidate, background) >= minContrast) return candidate
  return contrastRatio(PHOTO_TRANSLATION_NEAR_BLACK, background) >= contrastRatio(PHOTO_TRANSLATION_WHITE, background)
    ? PHOTO_TRANSLATION_NEAR_BLACK
    : PHOTO_TRANSLATION_WHITE
}

export function colorDistance(first: Rgb, second: Rgb): number {
  return Math.hypot(first.r - second.r, first.g - second.g, first.b - second.b)
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = sorted.length >> 1
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Per-channel median, or null without samples. */
export function medianColor(samples: readonly Rgb[]): Rgb | null {
  if (!samples.length) return null
  return {
    r: Math.round(median(samples.map(sample => sample.r))),
    g: Math.round(median(samples.map(sample => sample.g))),
    b: Math.round(median(samples.map(sample => sample.b))),
  }
}

/** 75th-percentile distance from the median: how much the ring varies. */
export function ringVariation(samples: readonly Rgb[], center: Rgb): number {
  if (!samples.length) return 0
  const distances = samples.map(sample => colorDistance(sample, center)).sort((left, right) => left - right)
  return distances[Math.min(distances.length - 1, Math.floor(distances.length * 0.75))]
}

function readPixel(image: SampleImage, x: number, y: number): Rgb | null {
  const px = Math.floor(x)
  const py = Math.floor(y)
  if (px < 0 || py < 0 || px >= image.width || py >= image.height) return null
  const index = (py * image.width + px) * 4
  return { r: image.data[index], g: image.data[index + 1], b: image.data[index + 2] }
}

function rectPoint(rect: Pick<PaintRect, 'cx' | 'cy' | 'angle'>, localX: number, localY: number): [number, number] {
  if (!rect.angle) return [rect.cx + localX, rect.cy + localY]
  const cos = Math.cos(rect.angle * DEG)
  const sin = Math.sin(rect.angle * DEG)
  return [rect.cx + localX * cos - localY * sin, rect.cy + localX * sin + localY * cos]
}

/** Pixels of the band just inside the edge of the (rotated) padded rectangle. */
export function sampleRingColors(image: SampleImage, rect: PaintRect, thickness = Math.max(1, rect.padding * 0.6)): Rgb[] {
  const samples: Rgb[] = []
  const halfWidth = rect.width / 2
  const halfHeight = rect.height / 2
  const band = Math.max(1, Math.min(thickness, halfWidth, halfHeight))
  const step = Math.max(1, (2 * (rect.width + rect.height)) / 800)
  const push = (localX: number, localY: number) => {
    const [x, y] = rectPoint(rect, localX, localY)
    const pixel = readPixel(image, x, y)
    if (pixel) samples.push(pixel)
  }
  for (let depth = 0.5; depth < band; depth += step) {
    for (let x = -halfWidth + 0.5; x < halfWidth; x += step) {
      push(x, -halfHeight + depth)
      push(x, halfHeight - depth)
    }
    for (let y = -halfHeight + band; y < halfHeight - band; y += step) {
      push(-halfWidth + depth, y)
      push(halfWidth - depth, y)
    }
  }
  return samples
}

/**
 * The text color: among the pixels of the tight text rectangle, the median of
 * the ones that differ most from the background (the glyph cores). Null when
 * nothing stands out from the background.
 */
export function sampleTextColor(image: SampleImage, rect: PaintRect, background: Rgb): Rgb | null {
  const pixels: Rgb[] = []
  const halfWidth = rect.textWidth / 2
  const halfHeight = rect.textHeight / 2
  const step = Math.max(1, Math.sqrt((rect.textWidth * rect.textHeight) / 1600))
  for (let y = -halfHeight + step / 2; y < halfHeight; y += step) {
    for (let x = -halfWidth + step / 2; x < halfWidth; x += step) {
      const [px, py] = rectPoint(rect, x, y)
      const pixel = readPixel(image, px, py)
      if (pixel) pixels.push(pixel)
    }
  }
  if (!pixels.length) return null
  const ranked = pixels
    .map(pixel => ({ pixel, distance: colorDistance(pixel, background) }))
    .sort((left, right) => right.distance - left.distance)
  const top = ranked.slice(0, Math.max(3, Math.ceil(ranked.length * 0.15)))
  if (median(top.map(entry => entry.distance)) < PHOTO_TRANSLATION_MIN_TEXT_DISTANCE) return null
  return medianColor(top.map(entry => entry.pixel))
}

/**
 * How one block is painted. With pixels: the ring median as the patch color
 * (a translucent blurred plate when the ring is busy) and the sampled glyph
 * color when it contrasts enough. Without usable pixels: the OCR style hints,
 * then the dark scrim.
 */
export function resolveBlockPaint(
  block: Pick<ConversationImageTextBlock, 'box' | 'angle' | 'vertical' | 'style'> & { text?: string },
  image: SampleImage | null,
): PhotoTranslationPaint {
  if (image && image.width > 0 && image.height > 0) {
    const rect = blockPaintRect(block, image)
    const ring = sampleRingColors(image, rect)
    const background = medianColor(ring)
    if (background) {
      const busy = ringVariation(ring, background) > PHOTO_TRANSLATION_BUSY_RING_DISTANCE
      const hint = parseHexColor(block.style?.color)
      const text = chooseTextColor(sampleTextColor(image, rect, background) ?? hint, background)
      return busy
        ? { kind: 'plate', background, alpha: PHOTO_TRANSLATION_PLATE_ALPHA, text }
        : { kind: 'flat', background, alpha: 1, text }
    }
  }
  const hintBackground = parseHexColor(block.style?.background)
  if (hintBackground) {
    return { kind: 'hint', background: hintBackground, alpha: 1, text: chooseTextColor(parseHexColor(block.style?.color), hintBackground) }
  }
  return PHOTO_TRANSLATION_SCRIM
}
