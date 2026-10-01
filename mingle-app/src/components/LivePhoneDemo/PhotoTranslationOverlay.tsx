'use client'

import { memo, useMemo, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ConversationImageTextBlock, ConversationImageTextOverlayBlock } from '@/lib/conversation-image-text'
import {
  PHOTO_TRANSLATION_LINE_HEIGHT,
  blockPaintRect,
  estimateTextWidthEm,
  inferBlockAlignments,
  layoutPhotoTranslationBlocks,
  toPercentRect,
  type PhotoTranslationBlockLayout,
  type TextMeasurer,
} from './photo-translation-geometry.logic'

/** Cross-fade on a language change (spec §1.7). */
export const PHOTO_TRANSLATION_FADE_MS = 180
/** Total stagger when results arrive while the viewer is open (spec §1.7). */
export const PHOTO_TRANSLATION_STAGGER_MS = 150
const STAGGER_STEP_MAX_MS = 30
const GLASS_LABEL_INLINE_PADDING_PX = 4

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

function patchStyle(layout: PhotoTranslationBlockLayout): CSSProperties {
  return {
    transform: layout.angle ? `rotate(${layout.angle}deg)` : undefined,
    backgroundColor: 'rgba(12, 14, 18, 0.66)',
    borderRadius: 5,
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    boxSizing: 'border-box',
  }
}

/** The glass patch without text: where a translation is on its way. */
const patchPlaceholderStyle: CSSProperties = {
  backgroundColor: 'rgba(12, 14, 18, 0.5)',
  borderRadius: 5,
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  boxSizing: 'border-box',
}

function textStyle(layout: PhotoTranslationBlockLayout): CSSProperties {
  return {
    fontSize: layout.fontSize,
    lineHeight: PHOTO_TRANSLATION_LINE_HEIGHT,
    fontWeight: layout.bold ? 700 : 500,
    color: '#fff',
    paddingInline: layout.inset,
    boxSizing: 'border-box',
    // Physical alignment, as in the photo: the container stays LTR and the
    // inner span resolves the text direction itself (dir="auto").
    direction: 'ltr',
    justifyContent: layout.align === 'left' ? 'flex-start' : layout.align === 'right' ? 'flex-end' : 'center',
    textAlign: layout.align,
    whiteSpace: layout.mode === 'single' ? 'nowrap' : 'pre-line',
    // Even line lengths instead of one word stranded on the last line (ignored where unsupported).
    // Only set for wrapping text: an undefined textWrap would reset the text-wrap-mode that
    // white-space: nowrap sets, because text-wrap is a shorthand of it.
    ...(layout.mode === 'wrap' ? { textWrap: 'balance' as const } : {}),
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
  /** All source blocks are used to infer each translation's text alignment. */
  blocks: readonly ConversationImageTextBlock[]
  /** What to paint for `language`: overlayBlocksFor(response, language). */
  painted: readonly ConversationImageTextOverlayBlock[]
  /** The shown language, or null for the original photo. */
  language: string | null
  reducedMotion?: boolean
  /** Blocks whose translation is still running: shown as shimmering placeholders where the text will go. */
  pendingBlocks?: readonly ConversationImageTextBlock[]
  /** The photo's text is still being read: a soft scan sweeps over the photo. */
  scanning?: boolean
}

const NO_PENDING_BLOCKS: readonly ConversationImageTextBlock[] = []
const PENDING_SHIMMER_SECONDS = 1.4
const SCAN_SECONDS = 1.9

/**
 * Glass-label overlay: a translucent dark label with white text sits over
 * each translated block. It lives inside the image stage, so it moves with
 * pinch, pan and swipe-to-dismiss. A label painted in both languages stays
 * solid while only its text cross-fades, so the original never flickers
 * through on a switch.
 */
function PhotoTranslationOverlay({ width, height, blocks, painted, language, reducedMotion = false, pendingBlocks = NO_PENDING_BLOCKS, scanning = false }: PhotoTranslationOverlayProps) {
  const alignments = useMemo(() => inferBlockAlignments(blocks), [blocks])
  const layouts = useMemo(() => (language
    ? layoutPhotoTranslationBlocks({ items: painted, stage: { width, height }, language, measure: textMeasurer(), alignments, sourceBlocks: blocks, inlinePaddingPx: GLASS_LABEL_INLINE_PADDING_PX })
    : []), [alignments, blocks, painted, width, height, language])

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

  // Where the translation will appear, for blocks still being translated.
  const placeholders = useMemo(() => pendingBlocks.map(block => {
    const rect = blockPaintRect(block, { width, height })
    return { id: block.id, rect: toPercentRect(rect, { width, height }), angle: rect.angle }
  }), [pendingBlocks, width, height])

  const fade = reducedMotion ? 0 : PHOTO_TRANSLATION_FADE_MS / 1000
  const step = layouts.length > 1 ? Math.min(STAGGER_STEP_MAX_MS, PHOTO_TRANSLATION_STAGGER_MS / (layouts.length - 1)) : 0

  return <div data-photo-translation-overlay aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
    {scanning && <motion.div data-photo-translation-scan className="absolute inset-x-0 top-0 h-1/3"
      style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0.26), rgba(255,255,255,0))' }}
      initial={{ y: '-100%' }} animate={reducedMotion ? { y: '100%' } : { y: ['-100%', '300%'] }}
      transition={reducedMotion ? { duration: 0 } : { duration: SCAN_SECONDS, repeat: Infinity, ease: 'easeInOut' }} />}
    {/* Placeholders fade out as the labels fade in, so the original text is never bare in between. */}
    <AnimatePresence initial={false}>
      {placeholders.map((placeholder, index) => <motion.div key={placeholder.id} data-photo-translation-pending={placeholder.id}
        className="absolute" style={{ left: `${placeholder.rect.left}%`, top: `${placeholder.rect.top}%`, width: `${placeholder.rect.width}%`, height: `${placeholder.rect.height}%` }}
        initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: fade } }} exit={{ opacity: 0, transition: { duration: fade } }}>
        <div className="absolute inset-0 overflow-hidden" style={{ ...patchPlaceholderStyle, transform: placeholder.angle ? `rotate(${placeholder.angle}deg)` : undefined }}>
          <motion.div className="absolute inset-y-0 left-0 w-1/2"
            style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.3), rgba(255,255,255,0))' }}
            initial={{ x: '-100%' }} animate={reducedMotion ? { x: '50%' } : { x: ['-100%', '200%'] }}
            transition={reducedMotion ? { duration: 0 } : { duration: PENDING_SHIMMER_SECONDS, repeat: Infinity, ease: 'linear', delay: (index % 6) * 0.08 }} />
        </div>
      </motion.div>)}
    </AnimatePresence>
    <AnimatePresence initial={false}>
      {layouts.map((layout, index) => {
        return <motion.div key={layout.id} data-photo-translation-block={layout.id} data-photo-translation-paint="glass"
          className="absolute"
          style={{ left: `${layout.rect.left}%`, top: `${layout.rect.top}%`, width: `${layout.rect.width}%`, height: `${layout.rect.height}%` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: fade, delay: !reducedMotion && arrival ? (index * step) / 1000 : 0 } }}
          exit={{ opacity: 0, transition: { duration: fade } }}>
          <div className="absolute inset-0" style={patchStyle(layout)}>
            <AnimatePresence initial={false}>
              <motion.span key={language ?? ''}
                className="absolute inset-0 flex items-center"
                style={textStyle(layout)}
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
