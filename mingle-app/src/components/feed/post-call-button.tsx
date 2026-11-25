"use client";

import { Loader2, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { isVoiceTalkAvailable } from "@/components/LivePhoneDemo/VoiceTalkPanel";
import { resolvePostCallCopy } from "@/i18n/post-call-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { replaceWithConversationListThenPush, type DirectConversationNavigationRouter } from "@/lib/direct-conversation-navigation";
import { markPostCallEntry, parsePostCallView } from "@/lib/post-call";
import { buildNativeAwareTabPath } from "@/lib/tab-navigation";

/** Opens the call screen of a call just asked for or just answered (the hidden room `conversationId`). */
export function openPostCallScreen(router: DirectConversationNavigationRouter, locale: string, conversationId: string): void {
  markPostCallEntry(conversationId);
  const listHref = buildNativeAwareTabPath(`/${locale}/conversations`, new URLSearchParams(window.location.search), { skipConversationRestore: true, tabRoot: true });
  replaceWithConversationListThenPush(router, listHref, conversationId);
}

/**
 * The call button on a call post's card (owner, 2026-11-25): rings the
 * author and opens the call screen, where the caller waits for an answer.
 * See src/server/post-calls.ts for who may call and when.
 */
export default function PostCallButton({ postId, locale }: { postId: string; locale: string }) {
  const router = useRouter();
  const copy = useMemo(() => resolvePostCallCopy(locale), [locale]);
  const [busy, setBusy] = useState(false);

  const call = useCallback(async () => {
    if (busy) return;
    // The call runs in the app (its voice engine); a browser has none.
    if (!isVoiceTalkAvailable()) {
      toast(copy.appOnly);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(buildClientApiPath(`/posts/${encodeURIComponent(postId)}/call`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      const body = await response.json().catch(() => null) as { call?: unknown; error?: string } | null;
      const view = response.ok ? parsePostCallView(body?.call) : null;
      if (!view) {
        toast(body?.error === "busy" || body?.error === "caller_busy" ? copy.busy : body?.error === "too_soon" ? copy.tooSoon : copy.unavailable);
        return;
      }
      openPostCallScreen(router, locale, view.conversationId);
    } catch {
      toast(copy.unavailable);
    } finally {
      setBusy(false);
    }
  }, [busy, copy, locale, postId, router]);

  return (
    <button
      type="button"
      data-feed-action
      data-qa="post-call-button"
      disabled={busy}
      onClick={(event) => {
        event.stopPropagation();
        void call();
      }}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 text-[13px] font-bold leading-none text-white shadow-[0_2px_8px_rgba(16,185,129,0.4)] transition active:scale-95 disabled:opacity-70"
    >
      {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Phone size={14} strokeWidth={2.6} aria-hidden="true" />}
      {copy.callButton}
    </button>
  );
}
