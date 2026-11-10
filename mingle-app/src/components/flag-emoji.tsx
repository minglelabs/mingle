"use client";

import { getFlagEmojiImageSrc, useFlagEmojiNeedsImages } from "@/lib/flag-emoji-support";

type FlagEmojiProps = {
  emoji: string;
  className?: string;
};

/**
 * A country flag emoji that also works where the OS has no flag glyphs
 * (Windows shows "KR" instead of 🇰🇷): there it renders the same flag as a
 * self-hosted Twemoji SVG sized to the surrounding text (1em).
 */
export default function FlagEmoji({ emoji, className = "" }: FlagEmojiProps) {
  const needsImages = useFlagEmojiNeedsImages();
  const imageSrc = needsImages ? getFlagEmojiImageSrc(emoji) : null;

  if (imageSrc) {
    return (
      <span className={`inline-flex items-center ${className}`} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- 1em inline glyph, not a content image */}
        <img src={imageSrc} alt="" draggable={false} className="inline-block h-[1em] w-[1em] select-none" />
      </span>
    );
  }

  return (
    <span className={className} aria-hidden="true">
      {emoji}
    </span>
  );
}
