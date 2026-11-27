'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Eye, ImagePlus, Loader2, Palette, Plus, RefreshCw, X } from 'lucide-react'
import type { FeedPostImageDto } from '@/lib/feed-post-dto'
import FeedPostPreview from '@/components/feed/feed-post-preview'
import { resolveBackgroundPreset } from '@/lib/post-backgrounds'
import { composeCopy, formatComposeCopy, type ComposeCopy } from '@/i18n/compose-copy'
import { resolveComposePhotoCopy } from '@/i18n/compose-photo-copy'
import { ComposeImageError, PICKER_IMAGE_TYPES, prepareComposeImage, type PreparedImage } from './compose-image'
import { composeGapCopy, type ComposeGapCopy } from './compose-gap-copy'
import { MAX_POST_LENGTH } from './compose-state'

export type ComposeEditorProps = {
  locale: string
  sourceText: string
  onChangeText: (text: string) => void
  backgroundKey: string | null
  /** Local preview URL for an image (object URL or the server image endpoint). */
  imagePreviewUrl: string | null
  imageDimensions: { width: number | null; height: number | null } | null
  /** A freshly picked+prepared image (before upload), or removal (null). */
  onPickImage: (prepared: PreparedImage | null) => void
  /** Only shown when provided (edit screen). Re-randomises the background. */
  onChangeBackground?: () => void
  author: { name: string | null; handle: string; imageUrl: string | null }
  disabled?: boolean
  /** Focus the body when the editor appears (new post). */
  autoFocus?: boolean
  /**
   * Wait this long before the auto-focus (compose panel: until it has slid
   * in). Focus never scrolls the page, so an off-screen field cannot drag
   * the whole app sideways.
   */
  autoFocusDelayMs?: number
  /** Controlled preview (compose overlay: back / edge swipe closes the preview first). */
  previewOpen?: boolean
  onPreviewOpenChange?: (open: boolean) => void
  /**
   * Several photos (new post): every photo in order, the first being
   * `imagePreviewUrl`. With `onAddPhotos` the picker takes many files and the
   * photos show as a row of thumbnails, each removable.
   */
  photos?: ReadonlyArray<{ id: string; url: string; width: number | null; height: number | null }>
  onAddPhotos?: (prepared: PreparedImage[]) => void
  onRemovePhoto?: (index: number) => void
  /**
   * The new-post screen, photo first (owner, 2026-11-27): a big photo area on
   * top (a large "choose photos" tile until one is picked, then the photos
   * full width, swiped through) and the caption under it. Needs `onAddPhotos`.
   */
  photoFirst?: boolean
  /**
   * Asked before the web photo picker opens: true when it handled the request
   * itself (the app's own gallery), so the web picker stays closed.
   */
  onRequestPhotos?: () => boolean
}

/** Most photos one post may carry (the server enforces the same). */
export const MAX_POST_PHOTOS = 10

/** The counter stays out of the way until the body is close to the limit. */
const COUNTER_VISIBLE_FROM = Math.floor(MAX_POST_LENGTH * 0.8)

function mapImageError(
  reason: ComposeImageError['reason'],
  copy: ComposeCopy,
  gapCopy: ComposeGapCopy,
): string {
  switch (reason) {
    case 'unsupported':
      return copy.photoUnsupported
    case 'heic_unsupported':
      return gapCopy.photoHeicUnsupported
    case 'too_large':
      return copy.photoTooLarge
    case 'decode_failed':
    case 'unavailable':
      // The web picker cannot tell a denied photo permission apart from an
      // unreadable file, so the failure message also points at Settings.
      return gapCopy.photoLoadFailed
    default:
      return copy.photoUploadFailed
  }
}

/** A 44px toolbar icon button. */
function ToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground/45 transition active:scale-90 active:bg-foreground/5 disabled:opacity-40"
    >
      {children}
    </button>
  )
}

/** A round control drawn over the attached photo. */
function PhotoOverlayButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex h-11 w-11 items-center justify-center disabled:opacity-50"
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition active:scale-90">
        {children}
      </span>
    </button>
  )
}

export default function ComposeEditor(props: ComposeEditorProps) {
  const copy = composeCopy(props.locale)
  const gapCopy = composeGapCopy(props.locale)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [preparing, setPreparing] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [localPreview, setLocalPreview] = useState(false)
  const showPreview = props.previewOpen ?? localPreview
  const setShowPreview = (open: boolean) => {
    if (props.onPreviewOpenChange) props.onPreviewOpenChange(open)
    else setLocalPreview(open)
  }

  const length = props.sourceText.length
  const overLimit = length > MAX_POST_LENGTH
  const displayName = props.author.name?.trim() || (props.author.handle ? `@${props.author.handle}` : '')

  // Auto-focus without scrolling the page (a native autoFocus on a field that
  // is still off-screen makes iOS scroll the whole document sideways).
  const autoFocus = props.autoFocus
  const autoFocusDelayMs = props.autoFocusDelayMs ?? 0
  useEffect(() => {
    if (!autoFocus) return
    const timer = window.setTimeout(() => {
      textareaRef.current?.focus({ preventScroll: true })
    }, autoFocusDelayMs)
    return () => window.clearTimeout(timer)
  }, [autoFocus, autoFocusDelayMs])

  // The body grows with its content; the screen scrolls, not the textarea.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [props.sourceText, showPreview])

  const multi = Boolean(props.onAddPhotos)
  const photoCount = props.photos?.length ?? 0

  async function handleFiles(list: FileList | null) {
    setImageError(null)
    const files = Array.from(list ?? []).slice(0, Math.max(0, MAX_POST_PHOTOS - photoCount))
    if (!files.length) return
    setPreparing(true)
    const prepared: PreparedImage[] = []
    for (const file of files) {
      try {
        prepared.push(await prepareComposeImage(file))
      } catch (err) {
        setImageError(
          err instanceof ComposeImageError ? mapImageError(err.reason, copy, gapCopy) : gapCopy.photoLoadFailed,
        )
      }
    }
    if (prepared.length) props.onAddPhotos?.(prepared)
    setPreparing(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleFile(file: File | undefined) {
    setImageError(null)
    if (!file) return
    setPreparing(true)
    try {
      const prepared = await prepareComposeImage(file)
      props.onPickImage(prepared)
    } catch (err) {
      setImageError(
        err instanceof ComposeImageError ? mapImageError(err.reason, copy, gapCopy) : gapCopy.photoLoadFailed,
      )
    } finally {
      setPreparing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const photoCopy = resolveComposePhotoCopy(props.locale)
  const [captionFocused, setCaptionFocused] = useState(false)
  // Once the keyboard is up (and the layout has followed), bring the text box into view.
  const keepCaretInView = () => {
    for (const delay of [120, 360]) {
      window.setTimeout(() => textareaRef.current?.scrollIntoView({ block: 'nearest' }), delay)
    }
  }
  const openPicker = () => {
    if (props.onRequestPhotos?.()) return
    fileInputRef.current?.click()
  }
  // Which photo of the swiped row is on screen (for its remove button and the counter).
  const pagerRef = useRef<HTMLDivElement>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const currentPage = Math.min(pageIndex, Math.max(0, photoCount - 1))
  const onPagerScroll = () => {
    const pager = pagerRef.current
    if (!pager || pager.clientWidth === 0) return
    setPageIndex(Math.round(Math.abs(pager.scrollLeft) / pager.clientWidth))
  }

  const previewImage: FeedPostImageDto | null = props.imagePreviewUrl
    ? {
        url: props.imagePreviewUrl,
        width: props.imageDimensions?.width ?? null,
        height: props.imageDimensions?.height ?? null,
      }
    : null

  const preset = resolveBackgroundPreset(props.backgroundKey)

  const sharedTail = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={PICKER_IMAGE_TYPES.join(',')}
        multiple={multi}
        className="hidden"
        onChange={(e) => void (multi ? handleFiles(e.target.files) : handleFile(e.target.files?.[0]))}
      />

      {/* Full-screen preview: exactly the feed card, over the editor. */}
      {showPreview ? (
        <div className="fixed inset-0 z-[70] bg-black" role="dialog" aria-modal="true" aria-label={copy.previewTitle}>
          <FeedPostPreview
            locale={props.locale}
            text={props.sourceText}
            backgroundKey={preset.key}
            image={previewImage}
            images={multi ? props.photos?.map((photo) => ({ url: photo.url, width: photo.width, height: photo.height })) : undefined}
            author={props.author}
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-3"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
          >
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              aria-label={copy.backToEdit}
              className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition active:scale-90">
                <X size={20} strokeWidth={2.4} aria-hidden="true" />
              </span>
            </button>
            <span className="rounded-full bg-black/55 px-3 py-1.5 text-[13px] font-semibold text-white backdrop-blur-sm">
              {copy.previewTitle}
            </span>
            <span className="h-11 w-11" aria-hidden="true" />
          </div>
        </div>
      ) : null}
    </>
  )

  if (props.photoFirst && multi) {
    const photos = props.photos ?? []
    // No photo and the person is writing: the post is a text post, so the
    // text takes the screen on the post's own background (as its card will
    // show it) and the photo tile shrinks to a bar (owner, 2026-11-27: a
    // photo is never required). The same elements stay mounted, so the
    // keyboard stays up while the layout changes (same elements, new classes).
    const textMode = photos.length === 0 && (captionFocused || props.sourceText.trim().length > 0)
    return (
      <div className="pb-4" data-qa="compose-photo-first" data-text-mode={textMode ? '1' : '0'}>
        {photos.length === 0 ? (
          <button
            type="button"
            data-qa="compose-photo-pick"
            onClick={openPicker}
            disabled={props.disabled || preparing}
            className={textMode
              ? 'mx-4 mt-3 flex h-11 w-[calc(100%-2rem)] items-center justify-center gap-2 rounded-xl border border-dashed border-foreground/20 text-[14px] font-semibold text-foreground/60 transition active:bg-foreground/5 disabled:opacity-70'
              : 'relative flex w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-amber-50 via-orange-50 to-orange-100 text-slate-800 transition active:brightness-95 disabled:opacity-70'}
            style={textMode ? undefined : { height: 'min(46vh, 110vw)' }}
          >
            <span className={textMode ? 'flex items-center' : 'flex h-16 w-16 items-center justify-center rounded-full bg-white text-orange-500 shadow-[0_6px_20px_rgba(249,115,22,0.25)]'}>
              {preparing ? <Loader2 size={textMode ? 18 : 28} className="animate-spin" aria-hidden="true" /> : <ImagePlus size={textMode ? 18 : 30} strokeWidth={2} aria-hidden="true" />}
            </span>
            <span className={textMode ? '' : 'text-[17px] font-bold'}>{textMode ? copy.addPhoto : photoCopy.pickTitle}</span>
            <span className={textMode ? 'hidden' : 'text-[13px] text-slate-500'}>{photoCopy.pickHint.replace('{max}', String(MAX_POST_PHOTOS))}</span>
          </button>
        ) : captionFocused ? (
          // Writing the caption: the photos shrink to a row so the text and the keyboard fit.
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-3" data-qa="compose-photo-strip">
            {photos.map((photo) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={photo.id} src={photo.url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" draggable={false} />
            ))}
          </div>
        ) : (
          <div className="relative bg-slate-950" style={{ height: 'min(52vh, 125vw)' }} data-qa="compose-photo-pager">
            <div ref={pagerRef} onScroll={onPagerScroll} className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto">
              {photos.map((photo) => (
                <div key={photo.id} className="relative h-full w-full shrink-0 snap-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt="" className="h-full w-full object-contain" draggable={false} />
                </div>
              ))}
            </div>
            {photos.length > 1 ? (
              <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-semibold tabular-nums text-white backdrop-blur-sm" data-qa="compose-photo-counter">
                {currentPage + 1}/{photos.length}
              </span>
            ) : null}
            <div className="absolute right-1.5 top-1.5">
              <PhotoOverlayButton
                label={copy.removePhoto}
                onClick={() => {
                  props.onRemovePhoto?.(currentPage)
                  setImageError(null)
                }}
                disabled={props.disabled}
              >
                <X size={16} strokeWidth={2.6} aria-hidden="true" />
              </PhotoOverlayButton>
            </div>
            {photos.length < MAX_POST_PHOTOS ? (
              <button
                type="button"
                data-qa="compose-photo-add"
                onClick={openPicker}
                disabled={props.disabled || preparing}
                className="absolute bottom-3 right-3 inline-flex h-9 items-center gap-1 rounded-full bg-white/90 px-3 text-[13px] font-bold text-slate-900 shadow-md backdrop-blur-sm active:scale-95 disabled:opacity-60"
              >
                {preparing ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Plus size={16} strokeWidth={2.6} aria-hidden="true" />}
                {photoCopy.addMore}
              </button>
            ) : null}
          </div>
        )}

        <div
          className={textMode ? 'mx-4 mt-3 flex min-h-[38vh] gap-3 rounded-3xl px-5 py-5 shadow-[0_6px_24px_rgba(15,23,42,0.10)]' : 'flex gap-3 px-4 pt-3'}
          style={textMode ? { background: preset.background, color: preset.textColor } : undefined}
          data-qa="compose-caption"
        >
          {props.author.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={props.author.imageUrl} alt="" className={textMode ? 'hidden' : 'h-9 w-9 shrink-0 rounded-full object-cover'} draggable={false} />
          ) : (
            <span aria-hidden="true" className={textMode ? 'hidden' : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-[14px] font-bold text-secondary-foreground'}>
              {displayName.replace(/^@/, '').charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <label htmlFor="compose-body" className="sr-only">{photoCopy.captionPlaceholder}</label>
            <textarea
              ref={textareaRef}
              id="compose-body"
              dir="auto"
              value={props.sourceText}
              onChange={(e) => props.onChangeText(e.target.value)}
              placeholder={textMode ? copy.editorPlaceholder : photoCopy.captionPlaceholder}
              disabled={props.disabled}
              rows={2}
              onFocus={() => {
                setCaptionFocused(true)
                keepCaretInView()
              }}
              onBlur={() => setCaptionFocused(false)}
              className={textMode
                ? 'block min-h-[3em] w-full resize-none overflow-hidden bg-transparent text-[22px] font-semibold leading-[1.45] outline-none placeholder:text-current placeholder:opacity-60'
                : 'block min-h-[3em] w-full resize-none overflow-hidden bg-transparent pt-1.5 text-[17px] leading-[1.5] outline-none placeholder:text-foreground/60'}
              style={{ whiteSpace: 'pre-wrap' }}
            />
          </div>
        </div>
        {imageError ? <p role="alert" className="mx-4 mt-2 text-[13px] text-destructive">{imageError}</p> : null}
        <div className="mt-2 flex items-center gap-2 px-4">
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            disabled={props.disabled}
            data-qa="compose-preview"
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground/5 px-3 text-[13px] font-semibold text-foreground/70 active:bg-foreground/10 disabled:opacity-50"
          >
            <Eye size={15} strokeWidth={2.2} aria-hidden="true" />
            {photoCopy.previewLabel}
          </button>
          {photos.length === 0 ? <span className="min-w-0 truncate text-[12px] text-foreground/45">{photoCopy.textOnly}</span> : null}
          <span
            role="status"
            aria-live="polite"
            className={
              length >= COUNTER_VISIBLE_FROM
                ? `ml-auto text-[13px] font-medium tabular-nums ${overLimit ? 'text-destructive' : 'text-foreground/45'}`
                : 'sr-only'
            }
          >
            {formatComposeCopy(copy.charCount, { count: length, max: MAX_POST_LENGTH })}
          </span>
        </div>
        {sharedTail}
      </div>
    )
  }

  return (
    <div className="px-4 pb-6 pt-3">
      <div className="flex gap-3">
        {props.author.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={props.author.imageUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded-full object-cover"
            draggable={false}
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-[15px] font-bold text-secondary-foreground"
          >
            {displayName.replace(/^@/, '').charAt(0).toUpperCase()}
          </span>
        )}

        <div className="min-w-0 flex-1">
          {displayName ? (
            <p className="truncate text-[15px] font-semibold leading-5" dir="auto">
              {displayName}
            </p>
          ) : null}

          <label htmlFor="compose-body" className="sr-only">
            {copy.editorPlaceholder}
          </label>
          <textarea
            ref={textareaRef}
            id="compose-body"
            dir="auto"
            value={props.sourceText}
            onChange={(e) => props.onChangeText(e.target.value)}
            placeholder={copy.editorPlaceholder}
            disabled={props.disabled}
            rows={1}
            className="mt-0.5 block min-h-[1.5em] w-full resize-none overflow-hidden bg-transparent text-[16px] leading-[1.5] outline-none placeholder:text-foreground/35"
            style={{ whiteSpace: 'pre-wrap' }}
          />

          {multi && photoCount > 0 ? (
            <div className="no-scrollbar -mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
              {props.photos!.map((photo, index) => (
                <div
                  key={photo.id}
                  className="relative h-40 shrink-0 overflow-hidden rounded-2xl border border-foreground/10"
                  style={{ background: preset.background, aspectRatio: photo.width && photo.height ? `${photo.width} / ${photo.height}` : '3 / 4' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt="" className="h-full w-full object-cover" draggable={false} />
                  <div className="absolute right-0.5 top-0.5">
                    <PhotoOverlayButton
                      label={copy.removePhoto}
                      onClick={() => {
                        props.onRemovePhoto?.(index)
                        setImageError(null)
                      }}
                      disabled={props.disabled}
                    >
                      <X size={16} strokeWidth={2.6} aria-hidden="true" />
                    </PhotoOverlayButton>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {!multi && props.imagePreviewUrl ? (
            <div
              className="relative mt-2 overflow-hidden rounded-2xl border border-foreground/10"
              // The letterbox shows the post's own background, as the feed card does.
              style={{ background: preset.background }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={props.imagePreviewUrl} alt="" className="max-h-[44vh] w-full object-contain" />
              <div className="absolute right-0.5 top-0.5 flex">
                <PhotoOverlayButton
                  label={copy.replacePhoto}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={props.disabled || preparing}
                >
                  <RefreshCw size={15} strokeWidth={2.4} aria-hidden="true" />
                </PhotoOverlayButton>
                <PhotoOverlayButton
                  label={copy.removePhoto}
                  onClick={() => {
                    props.onPickImage(null)
                    setImageError(null)
                  }}
                  disabled={props.disabled}
                >
                  <X size={16} strokeWidth={2.6} aria-hidden="true" />
                </PhotoOverlayButton>
              </div>
            </div>
          ) : null}

          {preparing ? (
            <p role="status" aria-live="polite" className="mt-2 flex items-center gap-1.5 text-[13px] text-foreground/55">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              {copy.photoProcessing}
            </p>
          ) : null}
          {imageError ? (
            <p role="alert" className="mt-2 text-[13px] text-destructive">
              {imageError}
            </p>
          ) : null}

          {/* Sits right under the text (Threads-style) and moves down as it grows. */}
          <div className="-ml-2 mt-1.5 flex items-center gap-0.5">
            <ToolButton
              label={!multi && props.imagePreviewUrl ? copy.replacePhoto : copy.addPhoto}
              onClick={() => fileInputRef.current?.click()}
              disabled={props.disabled || preparing || (multi && photoCount >= MAX_POST_PHOTOS)}
            >
              <ImagePlus size={20} strokeWidth={1.9} aria-hidden="true" />
            </ToolButton>
            {props.onChangeBackground ? (
              <ToolButton label={copy.changeBackground} onClick={props.onChangeBackground} disabled={props.disabled}>
                <Palette size={20} strokeWidth={1.9} aria-hidden="true" />
              </ToolButton>
            ) : null}
            <ToolButton label={copy.preview} onClick={() => setShowPreview(true)} disabled={props.disabled}>
              <Eye size={20} strokeWidth={1.9} aria-hidden="true" />
            </ToolButton>

            {/* Always announced; shown once the body nears the limit. */}
            <span
              role="status"
              aria-live="polite"
              className={
                length >= COUNTER_VISIBLE_FROM
                  ? `ml-auto text-[13px] font-medium tabular-nums ${overLimit ? 'text-destructive' : 'text-foreground/45'}`
                  : 'sr-only'
              }
            >
              {formatComposeCopy(copy.charCount, { count: length, max: MAX_POST_LENGTH })}
            </span>
          </div>
        </div>
      </div>

      {sharedTail}
    </div>
  )
}
