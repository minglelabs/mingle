"use client";

import { Clock, Phone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import FlagEmoji from "@/components/flag-emoji";
import PostCallButton from "@/components/feed/post-call-button";
import { resolvePostCategoryCopy } from "@/i18n/post-category-copy";
import { resolvePostIntroExtrasCopy } from "@/i18n/post-intro-extras-copy";
import type { AppLocale } from "@/i18n";
import { formatProfileAge } from "@/i18n/profile-age-copy";
import { countryFlagEmoji, getCountryDisplayName } from "@/lib/nationality";
import { postMinutesLeft, type PostCategory, type PostIntro } from "@/lib/post-category";

const PILL = "inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-white/90 px-2 text-[12px] font-semibold leading-none text-slate-800 shadow-[0_1px_4px_rgba(15,23,42,0.16)]";

/**
 * What kind of post a card is (owner, 2026-11-25): an hour post shows how long
 * it still has; a self-introduction shows the author's country, age, height
 * and hobbies; a call post shows how long it still takes calls, with the
 * call button for everyone but its author. An ordinary post shows nothing.
 * White pills, so they read on any background or photo.
 */
export default function PostCategoryStrip({
  category,
  expiresAt,
  intro,
  locale,
  postId,
  ownPost,
}: {
  category?: Exclude<PostCategory, "free">;
  expiresAt?: string | null;
  intro?: PostIntro | null;
  locale: string;
  /** For a call post: which post to call, and whether the viewer wrote it (no button then). */
  postId?: string;
  ownPost?: boolean;
}) {
  const copy = useMemo(() => resolvePostCategoryCopy(locale), [locale]);
  const extrasCopy = useMemo(() => resolvePostIntroExtrasCopy(locale), [locale]);
  // The minutes run down while the card is on screen.
  const [now, setNow] = useState(() => Date.now());
  const isCall = category === "call" && Boolean(expiresAt);
  const isHour = (category === "hour" || isCall) && Boolean(expiresAt);
  useEffect(() => {
    if (!isHour) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [isHour]);

  if (isCall) {
    const minutes = postMinutesLeft(expiresAt, now);
    return (
      <div className="mt-1 flex flex-wrap items-center gap-1.5" data-qa="post-category-strip" data-post-category="call">
        <span className={`${PILL} text-emerald-700`}>
          <Phone size={12} strokeWidth={2.6} aria-hidden="true" />
          {copy.categories.call}
          <span className="font-medium text-slate-500">· {copy.minutesLeft.replace("{n}", String(minutes ?? 1))}</span>
        </span>
        {postId && !ownPost ? <PostCallButton postId={postId} locale={locale} /> : null}
      </div>
    );
  }
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
        {/* The optional rest (2026-11-26): job, drinking, personality, food, animals, lately. */}
        {intro.job ? <span className={PILL} data-qa="post-intro-job">💼 {extrasCopy.jobs[intro.job]}</span> : null}
        {intro.drink ? <span className={PILL} data-qa="post-intro-drink">🍷 {extrasCopy.drinks[intro.drink]}</span> : null}
        {(intro.personality ?? []).map((entry) => <span key={`p-${entry}`} className={PILL}>🙂 {extrasCopy.personality[entry]}</span>)}
        {(intro.foods ?? []).map((entry) => <span key={`f-${entry}`} className={PILL}>🍽 {extrasCopy.foods[entry]}</span>)}
        {(intro.animals ?? []).map((entry) => <span key={`a-${entry}`} className={PILL}>🐾 {extrasCopy.animals[entry]}</span>)}
        {(intro.interests ?? []).map((entry) => <span key={`i-${entry}`} className={PILL}>✨ {extrasCopy.interests[entry]}</span>)}
      </div>
    );
  }
  return null;
}
