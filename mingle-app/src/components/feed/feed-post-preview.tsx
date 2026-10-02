"use client";

import type { FeedPostImageDto } from "@/lib/feed-post-dto";
import { generatePreviewText } from "@/lib/post-preview-text";
import { resolveViewColors } from "@/components/feed/feed-post-view";
import FeedPostView from "@/components/feed/feed-post-view";
import { useMemo } from "react";

/**
 * CONTRACT STUB body — the props are frozen; only the body is implemented here.
 *
 * Non-interactive full-screen rendering of an unpublished post. It draws
 * through the same `FeedPostView` layout as a real feed card, so C2's compose
 * preview cannot drift from what actually gets published.
 */
export type FeedPostPreviewProps = {
  locale: string;
  text: string;
  backgroundKey: string;
  image: FeedPostImageDto | null;
  author: { name: string | null; handle: string; imageUrl: string | null };
};

const PREVIEW_CARD_HEIGHT = "100dvh";

export default function FeedPostPreview({ text, backgroundKey, image, author }: FeedPostPreviewProps) {
  const preview = useMemo(() => generatePreviewText(text), [text]);
  const colors = useMemo(() => resolveViewColors(backgroundKey, Boolean(image)), [backgroundKey, image]);
  const displayName = author.name?.trim() || `@${author.handle}`;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <FeedPostView
      cardHeight={PREVIEW_CARD_HEIGHT}
      backgroundKey={backgroundKey}
      imageUrl={image?.url ?? null}
      displayText={text}
      previewText={preview.text}
      expanded={false}
      ariaLabel={`${displayName}: ${preview.text}`}
      authorSlot={
        <div className="mb-2 flex items-center gap-2">
          {author.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={author.imageUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full object-cover"
              draggable={false}
            />
          ) : (
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold"
              style={{ color: colors.textColor }}
            >
              {initial}
            </span>
          )}
          <span
            className="truncate text-sm font-semibold"
            style={{ color: colors.textColor, textShadow: colors.textShadow }}
          >
            {displayName}
          </span>
        </div>
      }
    />
  );
}
