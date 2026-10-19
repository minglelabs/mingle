'use client'

import { useState } from 'react'
import FeedPostView, { resolveViewColors } from '@/components/feed/feed-post-view'
import ImageZoomOverlay from '@/components/feed/image-zoom-overlay'
import PostLanguageChips, { ORIGINAL_CHIP } from '@/components/feed/post-language-chips'
import ProfileLanguageFlagStack from '@/components/profile-language-flag-stack'
import { generatePreviewText } from '@/lib/post-preview-text'

/** A phone screen in the app's proportions (iPhone 14: 390 × 844). */
const PHONE_WIDTH = 360
const PHONE_HEIGHT = Math.round((PHONE_WIDTH * 844) / 390)

/**
 * A post as the app draws it on a phone: the same card layout as the feed
 * (`FeedPostView`), so the photo is shown whole and letterboxed exactly as a
 * reader sees it, with the author row and the language flags on top.
 */
export function PhoneCard({ post, authorLanguages, translations }: {
  post: {
    id: string
    sourceText: string | null
    sourceLanguage: string | null
    backgroundKey: string | null
    imageWidth: number | null
    imageHeight: number | null
    hasImage: boolean
    author: { name: string | null; handle: string; image: string | null }
  }
  authorLanguages: readonly string[]
  translations: ReadonlyArray<{ language: string; text: string }>
}) {
  const [selected, setSelected] = useState(ORIGINAL_CHIP)
  const [zoom, setZoom] = useState(false)
  const imageUrl = post.hasImage ? `/api/posts/${post.id}/image` : null
  const text = translations.find((translation) => translation.language === selected)?.text ?? post.sourceText ?? ''
  const backgroundKey = post.backgroundKey ?? ''
  const colors = resolveViewColors(backgroundKey, Boolean(imageUrl))
  const name = post.author.name?.trim() || `@${post.author.handle}`
  const aspect = post.imageWidth && post.imageHeight ? `${post.imageWidth} / ${post.imageHeight}` : null

  return (
    <div className="mx-auto overflow-hidden rounded-[2rem] border-4 border-slate-900 bg-black shadow-sm" style={{ width: PHONE_WIDTH + 8 }}>
      <div className="relative" style={{ width: PHONE_WIDTH, height: PHONE_HEIGHT }} onClick={imageUrl ? () => setZoom(true) : undefined}>
        <FeedPostView
          cardHeight={`${PHONE_HEIGHT}px`}
          backgroundKey={backgroundKey}
          imageUrl={imageUrl}
          imageAspect={aspect}
          displayText={text}
          previewText={generatePreviewText(text).text}
          expanded={false}
          ariaLabel={`${name}: ${text}`}
          authorSlot={
            <div className="mb-2 flex items-center gap-3">
              <span className="relative inline-flex shrink-0">
                {post.author.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.author.image} alt="" className="h-12 w-12 rounded-full object-cover" draggable={false} />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-lg font-bold" style={{ color: colors.textColor }}>
                    {name.charAt(0)}
                  </span>
                )}
                <ProfileLanguageFlagStack languages={authorLanguages} size={48} />
              </span>
              <span className="truncate text-[17px] font-bold" style={{ color: colors.textColor, textShadow: colors.textShadow }}>{name}</span>
            </div>
          }
          controlSlot={translations.length ? (
            <div onClick={(event) => event.stopPropagation()}>
              <PostLanguageChips
                sourceLanguage={post.sourceLanguage}
                languages={translations.map((translation) => translation.language)}
                selected={selected}
                loadingLanguage={null}
                locale="ko"
                originalLabel="원문"
                onSelect={setSelected}
              />
            </div>
          ) : null}
        />
      </div>
      {imageUrl ? <ImageZoomOverlay open={zoom} src={imageUrl} alt="글 사진" closeLabel="닫기" reducedMotion={false} onClose={() => setZoom(false)} /> : null}
    </div>
  )
}
