'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Eye, ImagePlus, Loader2, Palette, RefreshCw, X } from 'lucide-react'
import type { FeedPostImageDto } from '@/lib/feed-post-dto'
import FeedPostPreview from '@/components/feed/feed-post-preview'
import { resolveBackgroundPreset } from '@/lib/post-backgrounds'
import { composeCopy, formatComposeCopy, type ComposeCopy } from '@/i18n/compose-copy'
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
}

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

  const previewImage: FeedPostImageDto | null = props.imagePreviewUrl
    ? {
        url: props.imagePreviewUrl,
        width: props.imageDimensions?.width ?? null,
        height: props.imageDimensions?.height ?? null,
      }
    : null

  const preset = resolveBackgroundPreset(props.backgroundKey)

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

          {props.imagePreviewUrl ? (
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
              label={props.imagePreviewUrl ? copy.replacePhoto : copy.addPhoto}
              onClick={() => fileInputRef.current?.click()}
              disabled={props.disabled || preparing}
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

      <input
        ref={fileInputRef}
        type="file"
        accept={PICKER_IMAGE_TYPES.join(',')}
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {/* Full-screen preview: exactly the feed card, over the editor. */}
      {showPreview ? (
        <div className="fixed inset-0 z-[70] bg-black" role="dialog" aria-modal="true" aria-label={copy.previewTitle}>
          <FeedPostPreview
            locale={props.locale}
            text={props.sourceText}
            backgroundKey={preset.key}
            image={previewImage}
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
    </div>
  )
}
