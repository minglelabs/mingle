"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { feedHref } from "@/lib/feed-routes";
import { composeCopy, formatComposeCopy } from "@/i18n/compose-copy";
import { moderationCopy } from "@/i18n/moderation-copy";
import { composeGapCopy } from "./compose-gap-copy";
import {
  clearPublishJob,
  getPublishJob,
  retryPublish,
  subscribePublishJob,
} from "./publish-store";

/**
 * The compose UI replaces the stub body; the props stay frozen.
 *
 * Publishing runs in the background (see publish-store) while the author keeps
 * using the app. The feed shell (C1) renders this banner above the cards. It
 * shows "Posting…", a success hand-off to the new post, or the failure state
 * with retry (body/image are kept by the store). A 429 shows the wait time.
 *
 * A failed post is saved as a draft by the store, and the banner says so;
 * dismissing it is then safe. If that save failed too, dismissing asks first,
 * because the body only lives in memory. A restricted account sees the
 * moderation notice and no retry.
 */
export type PublishStatusBannerProps = {
  locale: string;
};

export default function PublishStatusBanner({ locale }: PublishStatusBannerProps) {
  const job = useSyncExternalStore(subscribePublishJob, getPublishJob, () => null);
  const router = useRouter();
  const copy = composeCopy(locale);
  const gapCopy = composeGapCopy(locale);
  const [confirmingFor, setConfirmingFor] = useState<string | null>(null);

  // The success card steps aside on its own after a few seconds.
  const successKey = job?.status === "success" ? job.input.clientPostId : null;
  useEffect(() => {
    if (!successKey) return;
    const timer = window.setTimeout(() => {
      const current = getPublishJob();
      if (current?.status === "success" && current.input.clientPostId === successKey) clearPublishJob();
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [successKey]);

  if (!job) return null;

  if (job.status === "publishing") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mx-3 mt-2 flex items-center gap-3 rounded-2xl bg-white/95 px-3.5 py-3 text-[14px] text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.12)] ring-1 ring-black/5 backdrop-blur-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-200"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-50">
          <Loader2 size={17} className="animate-spin text-amber-500 motion-reduce:animate-none" aria-hidden="true" />
        </span>
        <span className="font-medium">{copy.bannerPublishing}</span>
      </div>
    );
  }

  if (job.status === "success") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mx-3 mt-2 flex items-center gap-3 rounded-2xl bg-white/95 px-3.5 py-3 text-[14px] text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.12)] ring-1 ring-black/5 backdrop-blur-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-200"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 size={18} className="text-emerald-500" aria-hidden="true" />
        </span>
        <span className="flex-1 font-medium">{copy.bannerSuccess}</span>
        {job.postId ? (
          <button
            type="button"
            onClick={() => {
              const target = job.postId;
              clearPublishJob();
              if (target) router.push(feedHref(locale, { postId: target }));
            }}
            className="inline-flex h-8 items-center rounded-full bg-slate-900 px-3.5 text-[13px] font-semibold text-white transition active:scale-95"
          >
            {copy.bannerViewPost}
          </button>
        ) : null}
        <button
          type="button"
          aria-label={copy.bannerDismiss}
          onClick={() => clearPublishJob()}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition active:bg-slate-100"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    );
  }

  // failed
  const rateLimited = job.retryAfterSeconds != null;
  const jobKey = job.input.clientPostId;
  const confirming = confirmingFor === jobKey;
  const message = job.restricted
    ? moderationCopy(locale).accountRestricted
    : rateLimited
      ? formatComposeCopy(copy.bannerRateLimited, { seconds: job.retryAfterSeconds ?? 0 })
      : job.savedAsDraft
        ? gapCopy.bannerFailedSavedDraft
        : copy.bannerFailed;

  if (confirming) {
    return (
      <div role="alert" className="mx-3 mt-2 flex items-center gap-3 rounded-2xl bg-white/95 px-3.5 py-3 text-[14px] text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.12)] ring-1 ring-black/5 backdrop-blur-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-200">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-50">
          <AlertCircle size={18} className="text-red-500" aria-hidden="true" />
        </span>
        <span className="flex-1 leading-snug">{gapCopy.discardFailedPrompt}</span>
        <button
          type="button"
          onClick={() => setConfirmingFor(null)}
          className="inline-flex h-8 items-center rounded-full bg-slate-100 px-3.5 text-[13px] font-semibold text-slate-700 transition active:scale-95"
        >
          {copy.cancel}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirmingFor(null);
            clearPublishJob();
          }}
          className="inline-flex h-8 items-center rounded-full bg-red-500 px-3.5 text-[13px] font-semibold text-white transition active:scale-95"
        >
          {gapCopy.discardFailedConfirm}
        </button>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="mx-3 mt-2 flex items-center gap-3 rounded-2xl bg-white/95 px-3.5 py-3 text-[14px] text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.12)] ring-1 ring-black/5 backdrop-blur-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-200"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-50">
          <AlertCircle size={18} className="text-red-500" aria-hidden="true" />
        </span>
      <span className="flex-1 leading-snug">{message}</span>
      {job.restricted ? null : (
        <button
          type="button"
          onClick={() => retryPublish()}
          className="inline-flex h-8 items-center rounded-full bg-slate-900 px-3.5 text-[13px] font-semibold text-white transition active:scale-95"
        >
          {copy.bannerRetry}
        </button>
      )}
      <button
        type="button"
        aria-label={copy.bannerDismiss}
        onClick={() => {
          // Only a body that exists nowhere else needs a confirmation.
          if (job.savedAsDraft) clearPublishJob();
          else setConfirmingFor(jobKey);
        }}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition active:bg-slate-100"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
