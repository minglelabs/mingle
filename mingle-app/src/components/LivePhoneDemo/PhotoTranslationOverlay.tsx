'use client'

import { memo, useMemo, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ConversationImageTextBlock, ConversationImageTextOverlayBlock } from '@/lib/conversation-image-text'
import {
  PHOTO_TRANSLATION_LINE_HEIGHT,
  estimateTextWidthEm,
  inferBlockAlignments,
  layoutPhotoTranslationBlocks,
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
}

/**
 * Glass-label overlay: a translucent dark label with white text sits over
 * each translated block. It lives inside the image stage, so it moves with
 * pinch, pan and swipe-to-dismiss. A label painted in both languages stays
 * solid while only its text cross-fades, so the original never flickers
 * through on a switch.
 */
function PhotoTranslationOverlay({ width, height, blocks, painted, language, reducedMotion = false }: PhotoTranslationOverlayProps) {
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

  const fade = reducedMotion ? 0 : PHOTO_TRANSLATION_FADE_MS / 1000
  const step = layouts.length > 1 ? Math.min(STAGGER_STEP_MAX_MS, PHOTO_TRANSLATION_STAGGER_MS / (layouts.length - 1)) : 0

  return <div data-photo-translation-overlay aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
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
