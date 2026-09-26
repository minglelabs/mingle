"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { feedHref } from "@/lib/feed-routes";
import { composeCopy, formatComposeCopy } from "@/i18n/compose-copy";
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
 */
export type PublishStatusBannerProps = {
  locale: string;
};

export default function PublishStatusBanner({ locale }: PublishStatusBannerProps) {
  const job = useSyncExternalStore(subscribePublishJob, getPublishJob, () => null);
  const router = useRouter();
  const copy = composeCopy(locale);

  if (!job) return null;

  if (job.status === "publishing") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 border-b border-border bg-card px-4 py-2.5 text-sm"
      >
        <Loader2 size={16} className="animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
        <span>{copy.bannerPublishing}</span>
      </div>
    );
  }

  if (job.status === "success") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 border-b border-border bg-card px-4 py-2.5 text-sm"
      >
        <CheckCircle2 size={16} className="text-emerald-500" aria-hidden="true" />
        <span className="flex-1">{copy.bannerSuccess}</span>
        {job.postId ? (
          <button
            type="button"
            onClick={() => {
              const target = job.postId;
              clearPublishJob();
              if (target) router.push(feedHref(locale, { postId: target }));
            }}
            className="inline-flex min-h-9 items-center rounded-lg px-2.5 py-1.5 font-medium text-primary hover:bg-secondary"
          >
            {copy.bannerViewPost}
          </button>
        ) : null}
        <button
          type="button"
          aria-label={copy.bannerDismiss}
          onClick={() => clearPublishJob()}
          className="inline-flex min-h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    );
  }

  // failed
  const rateLimited = job.retryAfterSeconds != null;
  return (
    <div
      role="alert"
      className="flex items-center gap-2 border-b border-border bg-card px-4 py-2.5 text-sm"
    >
      <AlertCircle size={16} className="text-destructive" aria-hidden="true" />
      <span className="flex-1">
        {rateLimited
          ? formatComposeCopy(copy.bannerRateLimited, { seconds: job.retryAfterSeconds ?? 0 })
          : copy.bannerFailed}
      </span>
      <button
        type="button"
        onClick={() => retryPublish()}
        className="inline-flex min-h-9 items-center rounded-lg px-2.5 py-1.5 font-medium text-primary hover:bg-secondary"
      >
        {copy.bannerRetry}
      </button>
      <button
        type="button"
        aria-label={copy.bannerDismiss}
        onClick={() => clearPublishJob()}
        className="inline-flex min-h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
