"use client";

import { Copy, Share2, Ticket } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import InviteMessageLanguagePicker from "@/components/contacts/invite-message-language-picker";
import {
  buildInviteTicketMessage,
  fillInviteTicketCopy,
  resolveInviteTicketCopy,
} from "@/i18n/invite-ticket-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { useInviteMessageLocale } from "@/lib/invite-message-locale";
import { captureMingleClientEvent } from "@/lib/posthog-client";
import { REFERRAL_REWARD_COINS, buildInviteLinkUrl } from "@/lib/referral-code";

export type InviteTicket = { code: string; rewardCoins: number };
/** Also says whether this account already entered someone else's code. */
export type OwnInviteTicket = InviteTicket & { redeemed: boolean };

/** Reads the user's own invite code; null until it arrives (or when offline). */
export function useOwnInviteTicket(open: boolean) {
  const [ticket, setTicket] = useState<OwnInviteTicket | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(buildClientApiPath("/referral"), { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json() as { code?: unknown; rewardCoins?: unknown; redeemed?: unknown };
        if (cancelled || typeof body.code !== "string") return;
        setTicket({
          code: body.code,
          rewardCoins: typeof body.rewardCoins === "number" ? body.rewardCoins : REFERRAL_REWARD_COINS,
          redeemed: body.redeemed === true,
        });
      } catch {
        // The buttons stay disabled; closing and reopening tries again.
      }
    })();
    return () => { cancelled = true; };
  }, [open]);
  return [ticket, setTicket] as const;
}


export async function copyText(value: string): Promise<boolean> {
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
 * The invite ticket with its message: the ticket card, the reward line, the
 * message-language picker, a preview, and Copy / Share. Used by the quick
 * sheet (chat list, friend invite) and the invite page (My Page).
 * The message is in one language the user picks (default: the UI language,
 * English for a Korean UI); the last pick is remembered.
 */
export default function InviteTicketPanel({ locale, ticket, senderName }: {
  locale: string;
  ticket: InviteTicket | null;
  senderName: string;
}) {
  const copy = useMemo(() => resolveInviteTicketCopy(locale), [locale]);
  const [messageLocale, setMessageLocale] = useInviteMessageLocale(locale);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Deferred out of the effect body (react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      if (!cancelled) setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    });
    return () => { cancelled = true; };
  }, []);

  const message = useMemo(() => {
    if (!ticket || typeof window === "undefined") return "";
    const link = buildInviteLinkUrl(window.location.origin, ticket.code);
    return link ? buildInviteTicketMessage(messageLocale, link, ticket.code) : "";
  }, [messageLocale, ticket]);

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

  return (
    <>
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

      <InviteMessageLanguagePicker
        value={messageLocale}
        onChange={setMessageLocale}
        label={copy.messageLanguage}
        className="mt-3"
      />

      {message ? (
        <p
          className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-gray-50 px-3.5 py-3 text-[13px] leading-relaxed text-gray-700"
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
    </>
  );
}
