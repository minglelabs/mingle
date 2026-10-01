'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { clientApiNamespace } from '@/lib/api-contract'
import { type ConversationMessageImage } from '@/lib/conversation-image'
import { blockNeedsTranslation, overlayBlocksFor, type ConversationImageTextBlock } from '@/lib/conversation-image-text'
import { resolveConversationImageCopy } from '@/i18n/conversation-image-copy'
import MessageMediaDialog from './MessageMediaDialog'
import PhotoTranslateControl from './PhotoTranslateControl'
import PhotoTranslationOverlay from './PhotoTranslationOverlay'
import PhotoTranslationStatusChip from './PhotoTranslationStatusChip'
import { ZoomableConversationImage, type ConversationImagePagerHandlers, type ConversationImageStage } from './ZoomableConversationImage'
import { conversationImageSrc, findConversationImageIndex } from './conversation-image-gallery.logic'
import { usePhotoTranslationRoom, type PhotoTranslationRoom } from './photo-translation-context'
import {
  PHOTO_TRANSLATION_OFF,
  buildPhotoTranslationOrder,
  photoTranslationMemoryKey,
  photoTranslationSelections,
  resolvePhotoTranslationKeyedSnapshot,
  resolvePhotoTranslationProgress,
  resolvePhotoTranslationToggle,
  type PhotoTranslationChoice,
  type PhotoTranslationKeyedSnapshot,
} from './photo-translation-toggle.logic'
import {
  PAGER_ANIMATION_MS,
  hasNextPage,
  hasPreviousPage,
  pagerTrackTransform,
  pagerWindowIndices,
  resolvePagerOffset,
  resolvePagerRelease,
  stepPagerIndex,
} from './photo-viewer-pager.logic'
import { backdropOpacityForProgress } from './swipe-to-dismiss.logic'
import { usePhotoTranslationText } from './use-photo-translation-text'

const NO_BLOCKS: readonly ConversationImageTextBlock[] = []
const NO_LANGUAGES: string[] = []
/** The chrome (close, counter, arrows, pill) is gone by this much drag progress. */
const CHROME_FADE_PER_PROGRESS = 1.6
const PAGE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

function stopPropagation(event: SyntheticEvent) {
  event.stopPropagation()
}

/**
 * Photo text translation for the photo on screen (spec §4): the data hook runs only while the viewer
 * is open and only for the shown photo, and it follows the photo when the viewer pages. Without a room
 * (share, spectate and legacy screens) it asks for nothing and offers no overlay.
 */
function useActivePhotoTranslation(room: PhotoTranslationRoom | null, image: ConversationMessageImage) {
  const reducedMotion = useReducedMotion() ?? false
  const order = useMemo(() => (room ? buildPhotoTranslationOrder(room.roomLanguages, room.defaultLanguage) : NO_LANGUAGES), [room])
  const response = usePhotoTranslationText({ conversationId: image.conversationId, messageId: image.messageId, languages: order, viewerUserId: room?.viewerUserId ?? '' })
  const memoryKey = photoTranslationMemoryKey({ apiNamespace: clientApiNamespace, viewerUserId: room?.viewerUserId, conversationId: image.conversationId, messageId: image.messageId })
  const [selectionSnapshot, setSelectionSnapshot] = useState<PhotoTranslationKeyedSnapshot<PhotoTranslationChoice | null>>(
    () => ({ key: memoryKey, value: photoTranslationSelections.get(memoryKey) ?? null }),
  )
  const selection = resolvePhotoTranslationKeyedSnapshot(
    selectionSnapshot,
    memoryKey,
    key => photoTranslationSelections.get(key) ?? null,
  )
  const toggle = useMemo(() => resolvePhotoTranslationToggle({ order, response, selection }), [order, response, selection])
  const language = toggle.choice === PHOTO_TRANSLATION_OFF ? null : toggle.choice
  const painted = useMemo(() => overlayBlocksFor(response, language), [response, language])
  const blocks = response?.blocks ?? NO_BLOCKS
  const progress = resolvePhotoTranslationProgress({ response, toggle })
  // Blocks whose translation is on its way show where it will appear.
  const pendingBlocks = useMemo(
    () => (progress === 'translating' && language ? blocks.filter(block => blockNeedsTranslation(block, language)) : NO_BLOCKS),
    [blocks, language, progress],
  )
  const select = useCallback((choice: PhotoTranslationChoice) => {
    photoTranslationSelections.set(memoryKey, choice)
    setSelectionSnapshot({ key: memoryKey, value: choice })
  }, [memoryKey])
  const renderOverlay = useCallback((stage: ConversationImageStage) => <PhotoTranslationOverlay
    width={stage.width} height={stage.height} blocks={blocks} painted={painted}
    language={language} reducedMotion={reducedMotion} pendingBlocks={pendingBlocks} scanning={progress === 'reading'} />,
  [blocks, language, painted, pendingBlocks, progress, reducedMotion])
  return { toggle, progress, language, painted, select, renderOverlay: room ? renderOverlay : undefined }
}

const CHROME_BUTTON_CLASS = 'pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-[10px] transition-colors active:bg-white/25'

/**
 * The full-screen photo viewer: the tapped photo with the rest of the room's photos on either side,
 * so a horizontal swipe turns the page. Pinch and double-tap zoom, swipe down to close (the backdrop
 * and the controls fade with the drag and nothing is left behind), and the photo text translation
 * pill and overlay for the photo on screen.
 */
type ConversationImageViewerProps = {
  images: readonly ConversationMessageImage[]
  initialMessageId: string
  locale: string
  onClose: () => void
}

export default function ConversationImageViewer(props: ConversationImageViewerProps) {
  return props.images.length ? <ConversationImageViewerContent {...props} /> : null
}

function ConversationImageViewerContent({ images, initialMessageId, locale, onClose }: ConversationImageViewerProps) {
  const copy = resolveConversationImageCopy(locale)
  const reducedMotion = useReducedMotion() ?? false
  const room = usePhotoTranslationRoom()
  const count = images.length

  // The photo on screen is tracked by message, not position: older photos loading above it must not
  // change which photo is shown.
  const [activeId, setActiveId] = useState(initialMessageId)
  const foundIndex = findConversationImageIndex(images, activeId)
  // If the shown photo goes away it stays on the position it had, now a neighbour.
  const [startIndex] = useState(() => Math.max(0, findConversationImageIndex(images, initialMessageId)))
  const index = foundIndex >= 0 ? foundIndex : Math.max(0, Math.min(startIndex, count - 1))
  const active = images[index]

  const translationRoom = room && active && room.conversationId === active.conversationId ? room : null
  const translation = useActivePhotoTranslation(translationRoom, active)

  // Drag-to-dismiss state of the photo on screen, for the backdrop and the controls.
  const [dragProgress, setDragProgress] = useState(0)
  const [backdropSettling, setBackdropSettling] = useState(false)
  const handleDragProgress = useCallback((progress: number) => setDragProgress(progress), [])
  const handleSettleChange = useCallback((settling: boolean) => setBackdropSettling(settling), [])

  // Failed photos show an inline retry; a neighbour that cannot load must not close the viewer.
  const [retries, setRetries] = useState<Readonly<Record<string, number>>>({})
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(() => new Set())
  const markFailed = useCallback((messageId: string) => setFailedIds(current => (current.has(messageId) ? current : new Set(current).add(messageId))), [])
  const retry = useCallback((messageId: string) => {
    setFailedIds(current => {
      if (!current.has(messageId)) return current
      const next = new Set(current)
      next.delete(messageId)
      return next
    })
    setRetries(current => ({ ...current, [messageId]: (current[messageId] ?? 0) + 1 }))
  }, [])

  // Paging: the track follows the finger 1:1, then animates to the page it settles on.
  const [pagerOffset, setPagerOffset] = useState(0)
  const [pagerAnimating, setPagerAnimating] = useState(false)
  const pagerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearPagerTimer = useCallback(() => {
    if (pagerTimerRef.current != null) {
      clearTimeout(pagerTimerRef.current)
      pagerTimerRef.current = null
    }
  }, [])
  useEffect(() => clearPagerTimer, [clearPagerTimer])

  const commitPage = useCallback((nextIndex: number) => {
    clearPagerTimer()
    setPagerOffset(0)
    if (nextIndex !== index && images[nextIndex]) {
      setActiveId(images[nextIndex].messageId)
      setDragProgress(0)
    }
    if (reducedMotion) {
      setPagerAnimating(false)
      return
    }
    setPagerAnimating(true)
    // transitionend normally ends it; the timer covers a transition that never runs (no change).
    pagerTimerRef.current = setTimeout(() => setPagerAnimating(false), PAGER_ANIMATION_MS + 60)
  }, [clearPagerTimer, images, index, reducedMotion])

  const pager = useMemo<ConversationImagePagerHandlers | undefined>(() => (count > 1 ? {
    onDrag: offsetX => {
      clearPagerTimer()
      setPagerAnimating(false)
      setPagerOffset(resolvePagerOffset(offsetX, { index, count }))
    },
    onRelease: ({ offsetX, velocityX, width }) => commitPage(resolvePagerRelease({ index, count, offsetX, velocityX, width })),
    onCancel: () => commitPage(index),
  } : undefined), [clearPagerTimer, commitPage, count, index])

  const stepPage = useCallback((delta: number) => {
    const next = stepPagerIndex(index, delta, count)
    if (next !== index) commitPage(next)
  }, [commitPage, count, index])

  // Arrow keys turn the page, unless the translation menu is open (it owns the arrows then).
  const stepPageRef = useRef(stepPage)
  useEffect(() => { stepPageRef.current = stepPage }, [stepPage])
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (document.querySelector('[role="menu"]')) return
      event.preventDefault()
      event.stopPropagation()
      stepPageRef.current(event.key === 'ArrowRight' ? 1 : -1)
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  const chromeOpacity = Math.max(0, 1 - dragProgress * CHROME_FADE_PER_PROGRESS)
  const chromeTransition = backdropSettling ? 'opacity 200ms ease-out' : undefined
  const position = { index, count }
  const { toggle, progress, language, painted } = translation

  return <MessageMediaDialog title={copy.image} onClose={onClose} dark fullscreen
    backdropOpacity={0.95 * backdropOpacityForProgress(dragProgress)} backdropTransition={backdropSettling}>
    <div data-conversation-image-viewer className="relative h-full w-full">
      {/* Only the sideways overflow is clipped: a photo dragged down must be free to leave the screen. */}
      <div data-conversation-image-pager className="absolute inset-0 overflow-x-clip">
        <div data-conversation-image-track className="absolute inset-0"
          onTransitionEnd={event => {
            if (event.target !== event.currentTarget || event.propertyName !== 'transform') return
            clearPagerTimer()
            setPagerAnimating(false)
          }}
          style={{
            transform: pagerTrackTransform(index, pagerOffset),
            transition: pagerAnimating ? `transform ${PAGER_ANIMATION_MS}ms ${PAGE_EASING}` : undefined,
            willChange: pagerAnimating || pagerOffset !== 0 ? 'transform' : undefined,
          }}>
          {pagerWindowIndices(index, count).map(slideIndex => {
            const image = images[slideIndex]
            const isActive = slideIndex === index
            const failed = failedIds.has(image.messageId)
            return <div key={image.messageId} data-conversation-image-slide={slideIndex} className="absolute inset-y-0 w-full"
              style={{ left: `${slideIndex * 100}%` }}>
              <ZoomableConversationImage
                src={conversationImageSrc(image, retries[image.messageId] ?? 0)}
                alt={count > 1 ? `${copy.image} ${slideIndex + 1}/${count}` : copy.image}
                width={image.width} height={image.height}
                active={isActive} pager={pager}
                onError={() => markFailed(image.messageId)}
                onDismiss={onClose} onDragProgress={handleDragProgress} onSettleChange={handleSettleChange}
                renderOverlay={isActive ? translation.renderOverlay : undefined}
                failure={failed
                  ? <div data-conversation-image-failure className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/80">
                    <p>{copy.loadError}</p>
                    <button type="button" onPointerDown={stopPropagation} onTouchStart={stopPropagation} onTouchEnd={stopPropagation}
                      onClick={event => { event.stopPropagation(); retry(image.messageId) }}
                      className="pointer-events-auto min-h-11 rounded-full bg-white/15 px-4 text-white">{copy.retry}</button>
                  </div>
                  : undefined} />
            </div>
          })}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 px-3"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)', opacity: chromeOpacity, transition: chromeTransition }}>
        <span className="h-11 w-11 shrink-0" aria-hidden="true" />
        {count > 1
          ? <div data-conversation-image-counter className="mt-2 rounded-full bg-white/15 px-3 py-1 text-[13px] font-semibold tabular-nums text-white backdrop-blur-[10px]">{index + 1} / {count}</div>
          : <span aria-hidden="true" />}
        <button type="button" aria-label={copy.close} onClick={onClose} disabled={dragProgress >= 1} className={CHROME_BUTTON_CLASS}><X size={22} /></button>
      </div>

      {count > 1 && <>
        {/* Arrow buttons are for a mouse; touch pages by swiping. */}
        <button type="button" aria-label={copy.previousPhoto} data-conversation-image-previous disabled={!hasPreviousPage(position)}
          onPointerDown={stopPropagation} onTouchStart={stopPropagation} onClick={() => stepPage(-1)}
          className={`${CHROME_BUTTON_CLASS} absolute left-3 top-1/2 z-10 hidden -translate-y-1/2 disabled:invisible [@media(hover:hover)_and_(pointer:fine)]:flex`}
          style={{ opacity: chromeOpacity, transition: chromeTransition }}><ChevronLeft size={24} /></button>
        <button type="button" aria-label={copy.nextPhoto} data-conversation-image-next disabled={!hasNextPage(position)}
          onPointerDown={stopPropagation} onTouchStart={stopPropagation} onClick={() => stepPage(1)}
          className={`${CHROME_BUTTON_CLASS} absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 disabled:invisible [@media(hover:hover)_and_(pointer:fine)]:flex`}
          style={{ opacity: chromeOpacity, transition: chromeTransition }}><ChevronRight size={24} /></button>
      </>}

      <div className="pointer-events-none absolute inset-x-0 z-10 flex justify-center"
        style={{ bottom: 'max(calc(env(safe-area-inset-bottom) + 12px), 20px)', opacity: chromeOpacity, transition: chromeTransition }}>
        <AnimatePresence initial={false}>
          {toggle.visible && translationRoom && <motion.div key="photo-translate"
            initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            exit={reducedMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.96 }}
            transition={{ duration: reducedMotion ? 0 : 0.18, ease: 'easeOut' }}>
            <PhotoTranslateControl options={toggle.options} cycle={toggle.cycle} choice={toggle.choice} pending={toggle.pending}
              uiLocale={translationRoom.uiLocale} copy={copy} disabled={dragProgress > 0} onSelect={translation.select} />
          </motion.div>}
          {!toggle.visible && progress === 'reading' && <motion.div key="photo-reading"
            initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            exit={reducedMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.96 }}
            transition={{ duration: reducedMotion ? 0 : 0.18, ease: 'easeOut' }}>
            <PhotoTranslationStatusChip label={copy.readingText} />
          </motion.div>}
        </AnimatePresence>
      </div>
      {/* The viewport is role="img", which hides the overlay from assistive tech; read the translation here. */}
      {painted.length > 0 && <div className="sr-only" lang={language ?? undefined}>
        {painted.map(({ block, text }) => <p key={block.id} dir="auto">{text}</p>)}
      </div>}
    </div>
  </MessageMediaDialog>
}
