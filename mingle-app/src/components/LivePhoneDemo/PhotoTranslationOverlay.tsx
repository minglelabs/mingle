'use client'

import { memo, useMemo, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ConversationImageTextBlock, ConversationImageTextOverlayBlock } from '@/lib/conversation-image-text'
import {
  PHOTO_TRANSLATION_LINE_HEIGHT,
  PHOTO_TRANSLATION_SCRIM,
  cssColor,
  estimateTextWidthEm,
  inferBlockAlignments,
  layoutPhotoTranslationBlocks,
  resolveBlockPaint,
  resolveFreeSpans,
  sampleCanvasSize,
  type PhotoTranslationBlockLayout,
  type PhotoTranslationPaint,
  type SampleImage,
  type TextMeasurer,
} from './photo-translation-geometry.logic'

/** Cross-fade on a language change (spec §1.7). */
export const PHOTO_TRANSLATION_FADE_MS = 180
/** Total stagger when results arrive while the viewer is open (spec §1.7). */
export const PHOTO_TRANSLATION_STAGGER_MS = 150
const STAGGER_STEP_MAX_MS = 30

const samples = new WeakMap<HTMLImageElement, SampleImage | null>()

/**
 * The loaded photo downscaled to at most 512 px on an offscreen canvas, read
 * once per img element. The image endpoint is same-origin, so the canvas is
 * readable; anything that throws falls back to the OCR style hints.
 */
function readSampleImage(image: HTMLImageElement): SampleImage | null {
  if (samples.has(image)) return samples.get(image) ?? null
  let sample: SampleImage | null = null
  try {
    const size = sampleCanvasSize({ width: image.naturalWidth, height: image.naturalHeight })
    const canvas = size.width > 0 ? document.createElement('canvas') : null
    const context = canvas?.getContext('2d', { willReadFrequently: true })
    if (canvas && context) {
      canvas.width = size.width
      canvas.height = size.height
      context.drawImage(image, 0, 0, size.width, size.height)
      sample = { width: size.width, height: size.height, data: context.getImageData(0, 0, size.width, size.height).data }
    }
  } catch {
    sample = null
  }
  samples.set(image, sample)
  return sample
}

let canvasMeasurer: TextMeasurer | null = null

/** Canvas text metrics in the app font; the glyph-class estimate outside a browser. */
function textMeasurer(): TextMeasurer {
  if (canvasMeasurer) return canvasMeasurer
  if (typeof document === 'undefined') return estimateTextWidthEm
  const context = document.createElement('canvas').getContext('2d')
  if (!context) return estimateTextWidthEm
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif'
  const widths = new Map<string, number>()
  canvasMeasurer = (text, bold) => {
    const key = `${bold ? 'b' : 'r'}:${text}`
    let width = widths.get(key)
    if (width === undefined) {
      context.font = `${bold ? 700 : 500} 100px ${family}`
      width = context.measureText(text).width / 100
      if (widths.size > 4000) widths.clear()
      widths.set(key, width)
    }
    return width
  }
  return canvasMeasurer
}

function patchStyle(layout: PhotoTranslationBlockLayout, paint: PhotoTranslationPaint): CSSProperties {
  const background = cssColor(paint.background, paint.alpha)
  const blur = paint.kind === 'plate' ? `blur(${layout.blur}px)` : undefined
  return {
    transform: layout.angle ? `rotate(${layout.angle}deg)` : undefined,
    backgroundColor: background,
    borderRadius: layout.radius,
    // Feather: a soft shadow in the patch color blends the edge into the photo.
    boxShadow: `0 0 ${layout.feather}px ${layout.feather / 2}px ${background}`,
    backdropFilter: blur,
    WebkitBackdropFilter: blur,
  }
}

function textStyle(layout: PhotoTranslationBlockLayout, paint: PhotoTranslationPaint): CSSProperties {
  return {
    fontSize: layout.fontSize,
    lineHeight: PHOTO_TRANSLATION_LINE_HEIGHT,
    fontWeight: layout.bold ? 700 : 500,
    color: cssColor(paint.text),
    paddingInline: layout.inset,
    // Physical alignment, as in the photo: the container stays LTR and the
    // inner span resolves the text direction itself (dir="auto").
    direction: 'ltr',
    justifyContent: layout.align === 'left' ? 'flex-start' : layout.align === 'right' ? 'flex-end' : 'center',
    textAlign: layout.align,
    whiteSpace: layout.mode === 'single' ? 'nowrap' : 'pre-line',
    wordBreak: layout.keepAll ? 'keep-all' : 'normal',
    overflowWrap: layout.breakWords ? 'anywhere' : 'normal',
    writingMode: layout.mode === 'vertical' ? 'vertical-rl' : undefined,
    textOrientation: layout.mode === 'vertical' ? 'upright' : undefined,
  }
}

type PhotoTranslationOverlayProps = {
  /**
   * The stage (contain-fit photo) size in px. Numbers, not an object: the
   * viewer re-renders on every pointermove, and memo must see equal props.
   */
  width: number
  height: number
  /** The loaded photo, for color sampling. */
  image: HTMLImageElement | null
  /** Every block of the photo; colors are sampled once per photo. */
  blocks: readonly ConversationImageTextBlock[]
  /** What to paint for `language`: overlayBlocksFor(response, language). */
  painted: readonly ConversationImageTextOverlayBlock[]
  /** The shown language, or null for the original photo. */
  language: string | null
  reducedMotion?: boolean
}

/**
 * Lens-style overlay (spec §4.4): each translated block is painted in place
 * over the photo in the photo's own colors. Pointer events pass through to the
 * viewport, and it lives inside the stage, so it moves with pinch, pan and
 * swipe-to-dismiss. A patch painted in both languages stays solid while only
 * its text cross-fades, so the original never flickers through on a switch.
 */
function PhotoTranslationOverlay({ width, height, image, blocks, painted, language, reducedMotion = false }: PhotoTranslationOverlayProps) {
  const sample = useMemo(() => (image ? readSampleImage(image) : null), [image])
  const paints = useMemo(() => new Map(blocks.map(block => [block.id, resolveBlockPaint(block, sample)])), [blocks, sample])
  const alignments = useMemo(() => inferBlockAlignments(blocks), [blocks])
  const freeSpans = useMemo(() => resolveFreeSpans(blocks, sample, paints), [blocks, sample, paints])
  const layouts = useMemo(() => (language
    ? layoutPhotoTranslationBlocks({ items: painted, stage: { width, height }, language, measure: textMeasurer(), alignments, freeSpans })
    : []), [alignments, freeSpans, painted, width, height, language])

  // Blocks that appear while the language stays the same are arriving
  // results (staggered fade-in); blocks that appear with a language change
  // are a switch (plain cross-fade). Kept in state, adjusted during render.
  const paintedKey = layouts.map(layout => layout.id).join(',')
  const [reveal, setReveal] = useState({ language, paintedKey, arrival: false })
  let arrival = reveal.arrival
  if (reveal.language !== language || reveal.paintedKey !== paintedKey) {
    arrival = reveal.language === language
    setReveal({ language, paintedKey, arrival })
  }

  const fade = reducedMotion ? 0 : PHOTO_TRANSLATION_FADE_MS / 1000
  const step = layouts.length > 1 ? Math.min(STAGGER_STEP_MAX_MS, PHOTO_TRANSLATION_STAGGER_MS / (layouts.length - 1)) : 0

  return <div data-photo-translation-overlay aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
    <AnimatePresence initial={false}>
      {layouts.map((layout, index) => {
        const paint = paints.get(layout.id) ?? PHOTO_TRANSLATION_SCRIM
        return <motion.div key={layout.id} data-photo-translation-block={layout.id} data-photo-translation-paint={paint.kind}
          className="absolute"
          style={{ left: `${layout.rect.left}%`, top: `${layout.rect.top}%`, width: `${layout.rect.width}%`, height: `${layout.rect.height}%` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: fade, delay: !reducedMotion && arrival ? (index * step) / 1000 : 0 } }}
          exit={{ opacity: 0, transition: { duration: fade } }}>
          <div className="absolute inset-0" style={patchStyle(layout, paint)}>
            <AnimatePresence initial={false}>
              <motion.span key={language ?? ''}
                className="absolute inset-0 flex items-center"
                style={textStyle(layout, paint)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: fade } }}
                exit={{ opacity: 0, transition: { duration: fade } }}>
                <span lang={language ?? undefined} dir="auto">{layout.text}</span>
              </motion.span>
            </AnimatePresence>
          </div>
        </motion.div>
      })}
    </AnimatePresence>
  </div>
}

export default memo(PhotoTranslationOverlay)
