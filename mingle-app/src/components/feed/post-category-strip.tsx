"use client";

import { Clock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import FlagEmoji from "@/components/flag-emoji";
import { resolvePostCategoryCopy } from "@/i18n/post-category-copy";
import type { AppLocale } from "@/i18n";
import { formatProfileAge } from "@/i18n/profile-age-copy";
import { countryFlagEmoji, getCountryDisplayName } from "@/lib/nationality";
import { postMinutesLeft, type PostCategory, type PostIntro } from "@/lib/post-category";

const PILL = "inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-white/90 px-2 text-[12px] font-semibold leading-none text-slate-800 shadow-[0_1px_4px_rgba(15,23,42,0.16)]";

/**
 * What kind of post a card is (owner, 2026-11-25): an hour post shows how long
 * it still has; a self-introduction shows the author's country, age, height
 * and hobbies. An ordinary post shows nothing. White pills, so they read on
 * any background or photo.
 */
export default function PostCategoryStrip({
  category,
  expiresAt,
  intro,
  locale,
}: {
  category?: PostCategory;
  expiresAt?: string | null;
  intro?: PostIntro | null;
  locale: string;
}) {
  const copy = useMemo(() => resolvePostCategoryCopy(locale), [locale]);
  // The minutes run down while the card is on screen.
  const [now, setNow] = useState(() => Date.now());
  const isHour = category === "hour" && Boolean(expiresAt);
  useEffect(() => {
    if (!isHour) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [isHour]);

  if (isHour) {
    const minutes = postMinutesLeft(expiresAt, now);
    return (
      <div className="mt-1 flex" data-qa="post-category-strip" data-post-category="hour">
        <span className={`${PILL} text-rose-600`}>
          <Clock size={12} strokeWidth={2.6} aria-hidden="true" />
          {copy.minutesLeft.replace("{n}", String(minutes ?? 1))}
        </span>
      </div>
    );
  }
  if (category === "intro" && intro) {
    return (
      <div className="mt-1 flex flex-wrap gap-1" data-qa="post-category-strip" data-post-category="intro">
        <span className={`${PILL} bg-amber-400 text-white`}>{copy.categories.intro}</span>
        {intro.country ? (
          <span className={PILL}>
            <FlagEmoji emoji={countryFlagEmoji(intro.country)} className="text-[12px] leading-none" />
            {getCountryDisplayName(intro.country, locale as AppLocale)}
          </span>
        ) : null}
        {typeof intro.age === "number" ? <span className={PILL}>{formatProfileAge(intro.age, locale as AppLocale)}</span> : null}
        {typeof intro.heightCm === "number" ? <span className={`${PILL} tabular-nums`}>{intro.heightCm}cm</span> : null}
        {intro.hobbies.map((hobby) => <span key={hobby} className={PILL}>#{copy.hobbies[hobby]}</span>)}
      </div>
    );
  }
  return null;
}
