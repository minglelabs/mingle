"use client";

import { Check, ChevronLeft, Copy, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import InviteTicketPanel, { copyText, useOwnInviteTicket } from "@/components/contacts/invite-ticket-panel";
import SlideSurface from "@/components/slide-surface";
import { resolveContactSyncCopy } from "@/i18n/contact-sync-copy";
import { resolveInviteTicketCopy } from "@/i18n/invite-ticket-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { refreshCoinWallet } from "@/lib/coin-wallet-client";
import { replaceWithConversationListThenPush } from "@/lib/direct-conversation-navigation";
import {
  fillReferralInviteMessage,
  normalizeReferralCode,
  REFERRAL_CODE_LENGTH,
  REFERRAL_REWARD_COINS,
} from "@/lib/referral-code";

type InviteScreenProps = {
  open: boolean;
  onClose: () => void;
  locale: string;
};

/**
 * The invite page, opened from My Page (and from contact sync): the user's
 * invite ticket with copy / share in a picked language, their own code, and
 * the field to enter a code someone else sent. Contact sync stays a separate
 * screen for texting contacts and finding friends.
 */
export default function InviteScreen({ open, onClose, locale }: InviteScreenProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const ticketCopy = useMemo(() => resolveInviteTicketCopy(locale), [locale]);
  const copy = useMemo(() => resolveContactSyncCopy(locale), [locale]);
  const [ticket, setTicket] = useOwnInviteTicket(open);
  const rewardCoins = ticket?.rewardCoins ?? REFERRAL_REWARD_COINS;
  const senderName = session?.user?.name?.trim() || ticketCopy.userFallback;
  const [codeInput, setCodeInput] = useState("");
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);

  const markRedeemed = useCallback(() => {
    setTicket((current) => (current ? { ...current, redeemed: true } : current));
  }, [setTicket]);

  const handleCopyCode = useCallback(async () => {
    if (ticket?.code && await copyText(ticket.code)) toast(copy.codeCopied);
  }, [copy.codeCopied, ticket?.code]);

  const handleRedeem = useCallback(async () => {
    if (isRedeeming) return;
    const code = normalizeReferralCode(codeInput);
    if (!code) {
      setRedeemError(copy.errorInvalid);
      return;
    }
    setIsRedeeming(true);
    setRedeemError(null);
    try {
      const response = await fetch(buildClientApiPath("/referral/redeem"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, source: "code", openRoom: true, locale }),
      });
      const body = await response.json().catch(() => ({})) as {
        error?: string; rewarded?: boolean; conversationId?: string | null;
      };
      if (response.ok && body.rewarded === false) {
        // The code is real but this account already accepted an invite.
        markRedeemed();
        setRedeemError(copy.errorAlready);
        return;
      }
      if (response.ok) {
        markRedeemed();
        setCodeInput("");
        toast(fillReferralInviteMessage(copy.redeemSuccess, { name: "", code: "", link: "", coins: rewardCoins }));
        void refreshCoinWallet({ force: true });
        if (body.conversationId) {
          // The room with the friend who invited them is where they wanted to go.
          onClose();
          replaceWithConversationListThenPush(router, `/${locale}/conversations`, body.conversationId);
        }
        return;
      }
      if (body.error === "already_redeemed") markRedeemed();
      setRedeemError(
        body.error === "invalid_code" ? copy.errorInvalid
          : body.error === "not_found" ? copy.errorNotFound
            : body.error === "own_code" ? copy.errorOwn
              : body.error === "already_redeemed" ? copy.errorAlready
                : copy.errorGeneric,
      );
    } catch {
      setRedeemError(copy.errorGeneric);
    } finally {
      setIsRedeeming(false);
    }
  }, [codeInput, copy, isRedeeming, locale, markRedeemed, onClose, rewardCoins, router]);

  return (
    <SlideSurface
      open={open}
      onClose={onClose}
      ariaLabel={ticketCopy.inviteScreenTitle}
      zIndex={135}
      nativeBackPriority={135}
      className="keyboard-safe fixed inset-0 z-[135] flex min-h-0 w-full flex-col bg-white text-slate-950"
      style={{ touchAction: "pan-y" }}
    >
      <header
        className="grid shrink-0 grid-cols-[44px_1fr_44px] items-center border-b border-gray-100 px-4"
        style={{
          height: "calc(54px + env(safe-area-inset-top, 44px))",
          paddingTop: "env(safe-area-inset-top, 44px)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-gray-100"
          aria-label={copy.later}
        >
          <ChevronLeft size={25} strokeWidth={2.1} aria-hidden="true" />
        </button>
        <h2 className="truncate text-center text-[17px] font-bold">{ticketCopy.inviteScreenTitle}</h2>
        <div aria-hidden="true" />
      </header>

      <div
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 pt-1"
        style={{ paddingBottom: "calc(28px + env(safe-area-inset-bottom, 0px))" }}
        data-testid="invite-screen"
      >
        <InviteTicketPanel locale={locale} ticket={ticket} senderName={senderName} />

        <section className="mt-6 flex items-center gap-3 rounded-2xl border border-gray-100 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-gray-500">{copy.myCodeLabel}</p>
            <p className="mt-0.5 font-mono text-[22px] font-bold tracking-[0.22em]" data-testid="invite-screen-my-code">
              {ticket?.code ?? "·····"}
            </p>
          </div>
          <button
            type="button"
            disabled={!ticket?.code}
            onClick={() => void handleCopyCode()}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-[13.5px] font-semibold text-slate-900 transition active:bg-gray-50 disabled:opacity-40"
          >
            <Copy size={15} strokeWidth={2.2} aria-hidden="true" />
            {copy.copyCode}
          </button>
        </section>

        <section className="mt-3 rounded-2xl border border-gray-100 px-4 py-4">
          <p className="text-[14px] font-bold">{copy.enterCodeLabel}</p>
          {ticket?.redeemed ? (
            <p className="mt-2 flex items-center gap-1.5 text-[13.5px] text-gray-500">
              <Check size={16} strokeWidth={2.4} className="text-emerald-600" aria-hidden="true" />
              {copy.redeemedDone}
            </p>
          ) : (
            <>
              <form
                className="mt-2 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleRedeem();
                }}
              >
                <input
                  value={codeInput}
                  onChange={(event) => {
                    setCodeInput(event.target.value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, REFERRAL_CODE_LENGTH));
                    setRedeemError(null);
                  }}
                  placeholder={copy.enterCodePlaceholder}
                  aria-label={copy.enterCodeLabel}
                  data-testid="invite-screen-code-input"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={REFERRAL_CODE_LENGTH}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3.5 font-mono text-[16px] tracking-[0.16em] outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-gray-400 focus:border-slate-400"
                />
                <button
                  type="submit"
                  disabled={isRedeeming || codeInput.length !== REFERRAL_CODE_LENGTH}
                  className="flex h-11 min-w-[72px] shrink-0 items-center justify-center rounded-xl bg-slate-950 px-4 text-[14px] font-semibold text-white transition active:opacity-80 disabled:opacity-40"
                >
                  {isRedeeming ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : copy.submit}
                </button>
              </form>
              {redeemError ? <p className="mt-2 text-[13px] text-rose-600" role="alert">{redeemError}</p> : null}
            </>
          )}
        </section>
      </div>
    </SlideSurface>
  );
}
