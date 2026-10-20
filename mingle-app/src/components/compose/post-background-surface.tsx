'use client'

import { resolveBackgroundPreset } from '@/lib/post-backgrounds'

/**
 * The visual card used inside the editor and the preview: the post body drawn
 * over its stored background with the catalog's contrast tokens, plus an
 * optional image. Line breaks, blank lines and paragraphs are preserved with
 * `whitespace-pre-wrap`. `FeedPostPreview` (C1) owns the real full-screen feed
 * rendering; this is the compose-local editing surface.
 */
export default function PostBackgroundSurface({
  backgroundKey,
  text,
  imageUrl,
  placeholder,
  compact = false,
}: {
  backgroundKey: string | null
  text: string
  imageUrl: string | null
  placeholder?: string
  compact?: boolean
}) {
  const preset = resolveBackgroundPreset(backgroundKey)
  const showPlaceholder = text.trim().length === 0 && !!placeholder

  return (
    <div
      className={`flex w-full flex-col items-stretch overflow-hidden rounded-2xl ${compact ? 'min-h-40' : 'min-h-64'}`}
      style={{ background: preset.background, color: preset.textColor }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="max-h-[46vh] w-full object-contain"
        />
      ) : null}
      {(text.trim().length > 0 || showPlaceholder) && (
        <p
          dir="auto"
          className="whitespace-pre-wrap break-words px-5 py-6 text-[17px] leading-relaxed [overflow-wrap:anywhere]"
          style={{ textShadow: preset.textShadow, opacity: showPlaceholder ? 0.65 : 1 }}
        >
          {showPlaceholder ? placeholder : text}
        </p>
      )}
    </div>
  )
}
