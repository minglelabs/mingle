"use client";

import { Loader2, Phone } from "lucide-react";
import { useMemo } from "react";
import { usePostCallAction } from "@/components/feed/post-call-button";
import { CompactLanguageLevels } from "@/components/profile-language-levels";
import ProfileNationalityBadge from "@/components/profile-nationality-badge";
import { resolvePostCategoryCopy } from "@/i18n/post-category-copy";
import { sanitizeInterestLanguages } from "@/lib/interest-languages";
import { resolveNationalityCountry } from "@/lib/nationality";

/**
 * A voice talk post's invitation (owner, 2026-11-27), above the author row of
 * its card: the author's photo with the nationality flag, the post's title
 * ("방제") and their comfortable ⇄ learning languages, the same block the
 * author saw while writing. For everyone but the author the whole block is the
 * call button. White, so it reads on any background or photo.
 */
export default function PostCallInvite({
  postId,
  locale,
  title,
  author,
  ownPost = false,
  demo = false,
}: {
  postId: string;
  locale: string;
  /** The post's own title; none: the viewer's default invitation. */
  title?: string | null;
  author: {
    name: string | null;
    handle: string;
    imageUrl: string | null;
    nationality?: string | null;
    languages?: { primary: string[]; interest: Array<{ code: string; level: number }> };
  };
  ownPost?: boolean;
  /** The compose preview: looks like the button, does nothing. */
  demo?: boolean;
}) {
  const categoryCopy = useMemo(() => resolvePostCategoryCopy(locale), [locale]);
  const { call, busy, copy } = usePostCallAction(postId, locale, demo);
  const displayName = author.name?.trim() || (author.handle ? `@${author.handle}` : "");
  const primary = author.languages?.primary ?? [];
  const canCall = !ownPost;
  const body = (
    <>
      <span className="relative shrink-0">
        {author.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={author.imageUrl} alt="" className="h-12 w-12 rounded-full object-cover" draggable={false} />
        ) : (
          <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-[17px] font-bold text-amber-700">
            {displayName.replace(/^@/, "").charAt(0).toUpperCase()}
          </span>
        )}
        <ProfileNationalityBadge country={resolveNationalityCountry(author.nationality ?? null, primary)} size={48} badgeSize={20} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left">
        <span className="line-clamp-2 text-[16px] font-bold leading-snug text-slate-950" dir="auto" data-qa="post-call-title">
          {title || categoryCopy.callTitleDefault}
        </span>
        {author.languages ? (
          <CompactLanguageLevels
            primaryLanguages={primary}
            interestLanguages={sanitizeInterestLanguages(author.languages.interest, primary)}
            locale={locale}
            textClass="text-slate-900"
            mutedClass="text-slate-300"
          />
        ) : null}
      </span>
      {canCall ? (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_2px_8px_rgba(16,185,129,0.45)]" aria-hidden="true">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Phone size={19} strokeWidth={2.4} />}
        </span>
      ) : null}
    </>
  );
  const boxClass = "mb-3 flex w-full items-center gap-3 rounded-2xl bg-white/92 px-3.5 py-3 shadow-[0_4px_16px_rgba(15,23,42,0.18)] backdrop-blur-sm";
  if (!canCall) {
    return <div className={boxClass} data-qa="post-call-invite">{body}</div>;
  }
  return (
    <button
      type="button"
      data-feed-action
      data-qa="post-call-invite"
      aria-label={`${title || categoryCopy.callTitleDefault} · ${copy.callButton}`}
      disabled={busy}
      onClick={(event) => {
        event.stopPropagation();
        void call();
      }}
      className={`${boxClass} transition active:scale-[0.98] disabled:opacity-80`}
    >
      {body}
    </button>
  );
}
