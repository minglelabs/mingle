// Pure geometry and color math for the photo translation overlay ("lens"
// style, spec §4.4). Boxes come from the shared contract as 0..1 fractions of
// the stored image; everything here works in pixels of a given surface (the
// on-screen stage, or the downscaled sample canvas) so rotation stays
// correct, and returns percentages for placement. No DOM access: text width
// comes from an injected measurer (canvas in the browser, an estimate here).

import type { ConversationImageTextBlock } from '@/lib/conversation-image-text'

export type Size = { width: number; height: number }

/** Boxes are tight around the glyphs; unpadded patches leave 16-24% of lines partly visible (R2 §0). */
export const PHOTO_TRANSLATION_PADDING_FRACTION = 0.15
/** Past this rotation the axis-aligned box cannot be inverted reliably; paint it unrotated. */
export const PHOTO_TRANSLATION_MAX_ROTATION_DEG = 40
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

type BlockGeometry = Pick<ConversationImageTextBlock, 'box' | 'angle' | 'vertical'>

/**
 * The patch rectangle of a block on a surface of `size` pixels: the text
 * rectangle (rotation recovered in pixels), padded on every side by 15% of
 * its height across the line direction (the column width for vertical text).
 */
export function blockPaintRect(block: BlockGeometry, size: Size, paddingFraction = PHOTO_TRANSLATION_PADDING_FRACTION): PaintRect {
  const [x0, y0, x1, y1] = block.box
  const boxWidth = (x1 - x0) * size.width
  const boxHeight = (y1 - y0) * size.height
  const rotated = recoverRotatedSize(boxWidth, boxHeight, block.angle)
  const crossSize = block.vertical ? rotated.width : rotated.height
  const padding = crossSize * paddingFraction
  return {
    cx: ((x0 + x1) / 2) * size.width,
    cy: ((y0 + y1) / 2) * size.height,
    width: rotated.width + 2 * padding,
    height: rotated.height + 2 * padding,
    textWidth: rotated.width,
    textHeight: rotated.height,
    padding,
    angle: rotated.angle,
  }
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

/** Columns needed for upright vertical text, with `perColumn` characters per column. */
export function verticalColumnCount(text: string, perColumn: number): number {
  if (!(perColumn >= 1)) return Infinity
  let columns = 0
  for (const line of text.split('\n')) {
    let length = 0
    for (const character of line) length += /\s/.test(character) ? 0.5 : 1
    columns += Math.max(1, Math.ceil(length / Math.floor(perColumn)))
  }
  return columns
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

export type PhotoTranslationBlockLayout = {
  id: string
  rect: PercentRect
  angle: number
  mode: PhotoTranslationFitMode
  fontSize: number
  /** Allow breaking inside words (only when whole words cannot fit). */
  breakWords: boolean
  /** Korean targets wrap at spaces only. */
  keepAll: boolean
  bold: boolean
  text: string
  /** Feather (box-shadow blur), corner radius and plate blur in stage pixels. */
  feather: number
  radius: number
  blur: number
}

/**
 * Everything the overlay needs to paint `language` on a stage of `stage`
 * pixels: patch placement, rotation, the fitting mode and a harmonized font
 * size per block.
 */
export function layoutPhotoTranslationBlocks({ items, stage, language, measure = estimateTextWidthEm }: {
  items: readonly { block: ConversationImageTextBlock; text: string }[]
  stage: Size
  language: string
  measure?: TextMeasurer
}): PhotoTranslationBlockLayout[] {
  if (!(stage.width > 0 && stage.height > 0)) return []
  const keepAll = language === 'ko'
  const vertical = isVerticalWritingLanguage(language)
  const drafts = items.map(({ block, text }) => {
    const rect = blockPaintRect(block, stage)
    const mode: PhotoTranslationFitMode = block.vertical
      ? vertical ? 'vertical' : 'wrap'
      : block.lines > 1 ? 'wrap' : 'single'
    const bold = block.style?.bold === true
    const shown = mode === 'single' ? text.replace(/\s*\n\s*/g, ' ').trim() : text
    const fit = { text: shown, mode, lines: block.lines, width: rect.width, height: rect.height, padding: rect.padding, bold, measure }
    let breakWords = false
    let fontSize = fitFontSize(fit)
    if (mode === 'wrap' && !Number.isFinite(wrapLineCount(shown, (rect.width - rect.padding) / fontSize, { bold, measure }))) {
      breakWords = true
      fontSize = fitFontSize({ ...fit, breakWords: true })
    }
    const crossSize = block.vertical ? rect.textWidth : rect.textHeight
    return {
      id: block.id,
      rect,
      mode,
      bold,
      text: shown,
      breakWords,
      fontSize,
      lineSize: crossSize / Math.max(1, block.lines),
      group: mode === 'vertical' ? 'vertical' : 'horizontal',
    }
  })
  const harmonized = harmonizeFontSizes(drafts)
  return drafts.map(draft => ({
    id: draft.id,
    rect: toPercentRect(draft.rect, stage),
    angle: draft.rect.angle,
    mode: draft.mode,
    fontSize: harmonized.get(draft.id) ?? draft.fontSize,
    breakWords: draft.breakWords,
    keepAll,
    bold: draft.bold,
    text: draft.text,
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
  block: Pick<ConversationImageTextBlock, 'box' | 'angle' | 'vertical' | 'style'>,
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
