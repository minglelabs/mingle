"use client";

import { polyfillCountryFlagEmojis } from "country-flag-emoji-polyfill";
import { useEffect } from "react";

/**
 * Windows has no country flag emoji glyphs, so "🇰🇷" renders as the letters
 * "KR". On browsers that support emoji but not flags, this registers a
 * self-hosted flag-only web font ("Twemoji Country Flags", listed first in the
 * font stack in globals.css). Browsers that already draw flags (iOS, Android,
 * macOS) are untouched and never download the font.
 */
export default function CountryFlagEmojiPolyfill() {
  useEffect(() => {
    polyfillCountryFlagEmojis("Twemoji Country Flags", "/fonts/TwemojiCountryFlags.woff2");
  }, []);
  return null;
}
