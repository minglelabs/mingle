"use client";

import type { FeedPost } from "@/lib/feed-data";
import type { PostBackgroundPreset } from "@/lib/post-backgrounds";
import { getBackgroundPreset } from "@/lib/post-backgrounds";
import { generatePreviewText } from "@/lib/post-preview-text";
import { Heart, MessageCircle, MoreHorizontal, UserPlus } from "lucide-react";
import { useMemo } from "react";

type FeedPostCardProps = {
  post: FeedPost;
  cardHeight: string;
  labels: {
    likeLabel: string;
    commentLabel: string;
    moreLabel: string;
    followLabel: string;
    translateLabel: string;
  };
};

export default function FeedPostCard({
  post,
  cardHeight,
  labels,
}: FeedPostCardProps) {
  const preset: PostBackgroundPreset | undefined = useMemo(
    () => getBackgroundPreset(post.backgroundKey),
    [post.backgroundKey],
  );

  const fallbackBg: PostBackgroundPreset = {
    key: "fallback",
    background: "#1e293b",
    textColor: "#f8fafc",
    textShadow: "0 1px 4px rgba(0,0,0,0.4)",
  };

  const bg = preset ?? fallbackBg;

  const preview = useMemo(
    () => generatePreviewText(post.bodyText),
    [post.bodyText],
  );

  const actionIconColor = bg.textColor;
  const actionIconShadow = bg.textShadow !== "none"
    ? `drop-shadow(${bg.textShadow})`
    : undefined;

  return (
    <article
      className="relative flex w-full shrink-0 snap-start snap-always flex-col overflow-hidden"
      style={{
        height: cardHeight,
        background: bg.background,
      }}
      aria-label={`${post.authorName}: ${preview.text}`}
    >
      {/* ── Image overlay (if present) ── */}
      {post.imageUrl ? (
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
          {/* Gradient scrim for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
        </div>
      ) : null}

      {/* ── Centre preview text (no image only) ── */}
      {!post.imageUrl ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8">
          <p
            className="max-w-full break-words text-center text-[1.5rem] font-bold leading-[1.45]"
            style={{
              color: bg.textColor,
              textShadow: bg.textShadow !== "none" ? bg.textShadow : undefined,
              wordBreak: "break-word",
              overflowWrap: "anywhere",
            }}
          >
            {preview.text}
          </p>
        </div>
      ) : null}

      {/* ── Bottom section: author + text (image posts) + actions ── */}
      <div className="relative mt-auto flex items-end gap-3 px-4 pb-5">
        {/* Left: author + body text */}
        <div className="min-w-0 flex-1" style={{ maxWidth: "calc(100% - 56px)" }}>
          {/* Author row */}
          <div className="mb-2 flex items-center gap-2">
            {/* Avatar placeholder */}
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold"
              style={{ color: bg.textColor }}
            >
              {post.authorName.charAt(0)}
            </span>
            <span
              className="truncate text-sm font-semibold"
              style={{
                color: post.imageUrl ? "#ffffff" : bg.textColor,
                textShadow: post.imageUrl
                  ? "0 1px 4px rgba(0,0,0,0.5)"
                  : bg.textShadow !== "none"
                    ? bg.textShadow
                    : undefined,
              }}
            >
              {post.authorName}
            </span>
            {!post.isFollowingAuthor ? (
              <button
                type="button"
                className="flex h-6 shrink-0 items-center gap-1 rounded-full bg-white/20 px-2 text-[11px] font-semibold backdrop-blur-sm transition active:scale-95"
                style={{
                  color: post.imageUrl ? "#ffffff" : bg.textColor,
                }}
                aria-label={`${labels.followLabel} ${post.authorName}`}
              >
                <UserPlus size={12} strokeWidth={2.5} />
                <span>{labels.followLabel}</span>
              </button>
            ) : null}
          </div>

          {/* Body text for image posts */}
          {post.imageUrl ? (
            <p
              className="line-clamp-3 text-sm leading-relaxed"
              style={{
                color: "#ffffff",
                textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                wordBreak: "break-word",
                overflowWrap: "anywhere",
              }}
            >
              {preview.text}
              {preview.isTruncated ? (
                <span className="ml-1 opacity-70">…</span>
              ) : null}
            </p>
          ) : null}

          {/* Translate button placeholder */}
          {post.isTranslated ? null : (
            <button
              type="button"
              className="mt-1 text-xs font-medium opacity-70 transition hover:opacity-100"
              style={{
                color: post.imageUrl ? "#ffffff" : bg.textColor,
              }}
            >
              {labels.translateLabel}
            </button>
          )}
        </div>

        {/* Right: action column */}
        <div className="flex shrink-0 flex-col items-center gap-4 pb-1">
          <button
            type="button"
            className="flex flex-col items-center gap-0.5 transition active:scale-95"
            aria-label={`${labels.likeLabel} ${post.likeCount}`}
          >
            <Heart
              size={26}
              fill={post.likedByMe ? "#ef4444" : "none"}
              stroke={post.likedByMe ? "#ef4444" : actionIconColor}
              strokeWidth={1.8}
              style={{ filter: actionIconShadow }}
            />
            <span
              className="text-[11px] font-semibold tabular-nums"
              style={{
                color: post.imageUrl ? "#ffffff" : actionIconColor,
                textShadow: post.imageUrl ? "0 1px 3px rgba(0,0,0,0.5)" : undefined,
              }}
            >
              {post.likeCount}
            </span>
          </button>

          <button
            type="button"
            className="flex flex-col items-center gap-0.5 transition active:scale-95"
            aria-label={`${labels.commentLabel} ${post.commentCount}`}
          >
            <MessageCircle
              size={26}
              stroke={post.imageUrl ? "#ffffff" : actionIconColor}
              strokeWidth={1.8}
              style={{ filter: actionIconShadow }}
            />
            <span
              className="text-[11px] font-semibold tabular-nums"
              style={{
                color: post.imageUrl ? "#ffffff" : actionIconColor,
                textShadow: post.imageUrl ? "0 1px 3px rgba(0,0,0,0.5)" : undefined,
              }}
            >
              {post.commentCount}
            </span>
          </button>

          <button
            type="button"
            className="transition active:scale-95"
            aria-label={labels.moreLabel}
          >
            <MoreHorizontal
              size={26}
              stroke={post.imageUrl ? "#ffffff" : actionIconColor}
              strokeWidth={1.8}
              style={{ filter: actionIconShadow }}
            />
          </button>
        </div>
      </div>
    </article>
  );
}
