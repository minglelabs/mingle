"use client";

import { Copy, Share2, Ticket, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  buildInviteTicketMessage,
  fillInviteTicketCopy,
  resolveInviteTicketCopy,
} from "@/i18n/invite-ticket-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { captureMingleClientEvent } from "@/lib/posthog-client";
import { REFERRAL_REWARD_COINS, buildInviteLinkUrl } from "@/lib/referral-code";

type InviteTicketSheetProps = {
  open: boolean;
  onClose: () => void;
  locale: string;
};

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the textarea copy below.
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}

/**
 * "Send a friend an invite ticket": shows the user's ticket and copies a short
 * message (partner's language first for Korean and Japanese users) with the
 * invite link, ready to paste into LINE, KakaoTalk or HelloTalk.
 */
export default function InviteTicketSheet({ open, onClose, locale }: InviteTicketSheetProps) {
  const { data: session } = useSession();
  const copy = useMemo(() => resolveInviteTicketCopy(locale), [locale]);
  const [ticket, setTicket] = useState<{ code: string; rewardCoins: number } | null>(null);
  const [canShare, setCanShare] = useState(false);
  const senderName = session?.user?.name?.trim() || copy.userFallback;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Deferred out of the effect body (react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      if (!cancelled) setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    });
    void (async () => {
      try {
        const response = await fetch(buildClientApiPath("/referral"), { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json() as { code?: unknown; rewardCoins?: unknown };
        if (cancelled || typeof body.code !== "string") return;
        setTicket({
          code: body.code,
          rewardCoins: typeof body.rewardCoins === "number" ? body.rewardCoins : REFERRAL_REWARD_COINS,
        });
      } catch {
        // The buttons stay disabled; closing and reopening tries again.
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const message = useMemo(() => {
    if (!ticket || typeof window === "undefined") return "";
    const link = buildInviteLinkUrl(window.location.origin, ticket.code);
    return link ? buildInviteTicketMessage(locale, link) : "";
  }, [locale, ticket]);

  const handleCopy = useCallback(async () => {
    if (!message || !(await copyText(message))) return;
    captureMingleClientEvent("mingle_invite_ticket_created", { method: "copy" });
    toast(copy.ticketCopied);
  }, [copy.ticketCopied, message]);

  const handleShare = useCallback(async () => {
    if (!message) return;
    try {
      await navigator.share({ text: message });
      captureMingleClientEvent("mingle_invite_ticket_created", { method: "share" });
    } catch {
      // Closed the share sheet: nothing was sent.
    }
  }, [message]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={copy.sendTicket}>
      <button type="button" className="absolute inset-0 bg-black/45" aria-label={copy.sendTicket} onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-t-[28px] bg-white px-5 pt-5 text-slate-950 shadow-[0_-18px_50px_rgba(15,23,42,0.22)]"
        style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-bold">{copy.sendTicket}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition active:bg-gray-100"
            aria-label={copy.sendTicket}
          >
            <X size={20} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>

        {/* The ticket: a stub with the sender on the left, the code on the right. */}
        <div
          className="relative mt-4 flex overflow-hidden rounded-2xl text-white shadow-[0_14px_34px_rgba(53,105,237,0.32)]"
          style={{ background: "linear-gradient(135deg, #1295e8 0%, #3569ed 52%, #7338f2 100%)" }}
          data-testid="invite-ticket-card"
        >
          <div className="min-w-0 flex-1 px-5 py-5">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/80">
              <Ticket size={15} strokeWidth={2.2} aria-hidden="true" />
              {copy.ticketTitle}
            </p>
            <p className="mt-2 text-[18px] font-bold leading-snug">
              {fillInviteTicketCopy(copy.ticketFrom, { name: senderName })}
            </p>
          </div>
          <div className="flex w-[104px] shrink-0 flex-col items-center justify-center border-l-2 border-dashed border-white/45 px-2 py-5">
            <span className="font-mono text-[19px] font-bold tracking-[0.14em]">{ticket?.code ?? "·····"}</span>
          </div>
          <span className="absolute -top-2.5 right-[94px] h-5 w-5 rounded-full bg-white" aria-hidden="true" />
          <span className="absolute -bottom-2.5 right-[94px] h-5 w-5 rounded-full bg-white" aria-hidden="true" />
        </div>

        <p className="mt-3 text-[13.5px] leading-relaxed text-gray-600">
          {fillInviteTicketCopy(copy.ticketBenefit, { coins: ticket?.rewardCoins ?? REFERRAL_REWARD_COINS })}
        </p>

        {message ? (
          <p
            className="mt-3 max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-gray-50 px-3.5 py-3 text-[13px] leading-relaxed text-gray-700"
            data-testid="invite-ticket-message"
          >
            {message}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={!message}
            onClick={() => void handleCopy()}
            className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 text-[15px] font-bold text-white transition active:opacity-80 disabled:opacity-40"
          >
            <Copy size={17} strokeWidth={2.2} aria-hidden="true" />
            {copy.copyTicket}
          </button>
          {canShare ? (
            <button
              type="button"
              disabled={!message}
              onClick={() => void handleShare()}
              className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 px-5 text-[15px] font-semibold text-slate-900 transition active:bg-gray-50 disabled:opacity-40"
            >
              <Share2 size={17} strokeWidth={2.2} aria-hidden="true" />
              {copy.share}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
