'use client'

import { useRef, useState } from 'react'
import { ImagePlus, RefreshCw, X, Eye } from 'lucide-react'
import type { FeedPostImageDto } from '@/lib/feed-post-dto'
import FeedPostPreview from '@/components/feed/feed-post-preview'
import { composeCopy, formatComposeCopy, type ComposeCopy } from '@/i18n/compose-copy'
import { ComposeImageError, PICKER_IMAGE_TYPES, prepareComposeImage, type PreparedImage } from './compose-image'
import { composeGapCopy, type ComposeGapCopy } from './compose-gap-copy'
import { MAX_POST_LENGTH } from './compose-state'
import PostBackgroundSurface from './post-background-surface'

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
}

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

export default function ComposeEditor(props: ComposeEditorProps) {
  const copy = composeCopy(props.locale)
  const gapCopy = composeGapCopy(props.locale)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preparing, setPreparing] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const length = props.sourceText.length
  const overLimit = length > MAX_POST_LENGTH

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

  if (showPreview) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-base font-semibold">{copy.previewTitle}</h2>
          <button
            type="button"
            onClick={() => setShowPreview(false)}
            className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm text-primary hover:bg-secondary"
          >
            {copy.backToEdit}
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <FeedPostPreview
            locale={props.locale}
            text={props.sourceText}
            backgroundKey={props.backgroundKey ?? 'warm-cream'}
            image={previewImage}
            author={props.author}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="rounded-2xl border border-border bg-card">
        <label htmlFor="compose-body" className="sr-only">
          {copy.editorPlaceholder}
        </label>
        <textarea
          id="compose-body"
          dir="auto"
          value={props.sourceText}
          onChange={(e) => props.onChangeText(e.target.value)}
          placeholder={copy.editorPlaceholder}
          disabled={props.disabled}
          rows={7}
          className="min-h-40 w-full resize-none rounded-2xl bg-transparent px-4 py-3 text-[16px] leading-relaxed outline-none placeholder:text-muted-foreground"
          style={{ whiteSpace: 'pre-wrap' }}
        />
        <div className="flex items-center justify-between px-4 pb-2">
          <span
            role="status"
            aria-live="polite"
            className={`text-xs ${overLimit ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {formatComposeCopy(copy.charCount, { count: length, max: MAX_POST_LENGTH })}
          </span>
        </div>
      </div>

      {props.imagePreviewUrl ? (
        <div className="relative">
          <PostBackgroundSurface
            backgroundKey={props.backgroundKey}
            text=""
            imageUrl={props.imagePreviewUrl}
            compact
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={props.disabled || preparing}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground hover:opacity-90 disabled:opacity-60"
            >
              <RefreshCw size={16} aria-hidden="true" />
              {copy.replacePhoto}
            </button>
            <button
              type="button"
              onClick={() => {
                props.onPickImage(null)
                setImageError(null)
              }}
              disabled={props.disabled}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-secondary disabled:opacity-60"
            >
              <X size={16} aria-hidden="true" />
              {copy.removePhoto}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={props.disabled || preparing}
          className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground hover:opacity-90 disabled:opacity-60"
        >
          <ImagePlus size={16} aria-hidden="true" />
          {preparing ? copy.photoProcessing : copy.addPhoto}
        </button>
      )}

      {imageError ? (
        <p role="alert" className="text-xs text-destructive">
          {imageError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {props.onChangeBackground ? (
          <button
            type="button"
            onClick={props.onChangeBackground}
            disabled={props.disabled}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-60"
          >
            <RefreshCw size={16} aria-hidden="true" />
            {copy.changeBackground}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setShowPreview(true)}
          disabled={props.disabled}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-60"
        >
          <Eye size={16} aria-hidden="true" />
          {copy.preview}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={PICKER_IMAGE_TYPES.join(',')}
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  )
}
