"use client";

import { useState, type ReactNode } from "react";
import type { FeedPostDto } from "@/lib/feed-post-dto";
import { resolveBackgroundPreset } from "@/lib/post-backgrounds";
import { searchCopy } from "@/i18n/search-copy";
import { resolveGridTilePreview } from "./post-grid-tile-text";

/**
 * CONTRACT STUB — the profile/search UI replaces the body; the props are frozen.
 *
 * One square tile of a 3-column post grid. The profile grid, post search
 * results and the archive / trash / hidden-posts lists all render this, so the
 * thumbnail rule lives in exactly one place:
 * - With an image, the image is the thumbnail, whether or not there is text.
 * - Without one, the post's stored background with the first ~20 characters of
 *   the body in large type (a short body in full), sized and wrapped to stay
 *   inside the tile.
 * - Text follows the default display-language policy: `displayText` when the
 *   translation is ready, otherwise `sourceText`.
 * - No like or comment counts.
 * - An image that fails to load (removed object, a list the viewer can no
 *   longer read, offline) falls back to the text tile instead of a broken
 *   image, so the tile always shows the post's background and words.
 */
export type PostGridTileProps = {
  post: Pick<FeedPostDto, "id" | "sourceText" | "displayText" | "translationState" | "backgroundKey" | "image">;
  locale: string;
  onSelect: (postId: string) => void;
  /** Corner badge for management lists, e.g. the days left in the trash. */
  badge?: ReactNode;
};

export default function PostGridTile({ post, locale, onSelect, badge }: PostGridTileProps) {
  const preview = resolveGridTilePreview(post);
  const previewText = preview.text.trim();
  const accessibleName = previewText || searchCopy(locale).postTileLabel;
  // Remember WHICH url failed, so a post whose image changes is tried again.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageUrl = post.image?.url ?? null;
  const showImage = imageUrl !== null && failedUrl !== imageUrl;

  return (
    <button
      type="button"
      onClick={() => onSelect(post.id)}
      aria-label={accessibleName}
      className="post-grid-tile relative block aspect-square w-full overflow-hidden bg-gray-100 transition active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          onError={() => setFailedUrl(imageUrl)}
          className="h-full w-full object-cover"
        />
      ) : (
        <TextTile
          backgroundKey={post.backgroundKey}
          text={preview.text}
        />
      )}
      {badge != null ? (
        <span className="pointer-events-none absolute right-1.5 top-1.5 z-10">{badge}</span>
      ) : null}
    </button>
  );
}

function TextTile({ backgroundKey, text }: { backgroundKey: string; text: string }) {
  const preset = resolveBackgroundPreset(backgroundKey);
  // Shrink type as the snippet grows so even a ~40-char body stays inside the
  // tile without clipping; short bodies read large. `line-clamp` is the final
  // guard against overflow on very narrow tiles.
  const length = [...text].length;
  const sizeClass = length <= 8
    ? "text-lg leading-snug"
    : length <= 18
      ? "text-[15px] leading-snug"
      : length <= 30
        ? "text-[13px] leading-snug"
        : "text-[11px] leading-tight";

  return (
    <span
      className="flex h-full w-full items-center justify-center p-2.5"
      style={{ background: preset.background }}
    >
      <span
        className={`line-clamp-4 break-words text-center font-semibold [overflow-wrap:anywhere] ${sizeClass}`}
        style={{ color: preset.textColor, textShadow: preset.textShadow }}
      >
        {text}
      </span>
    </span>
  );
}
