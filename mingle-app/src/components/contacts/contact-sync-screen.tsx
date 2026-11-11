"use client";

import { Check, ChevronLeft, Copy, Gift, Loader2, MessageSquareText, Search, UserRound, Users, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import SlideSurface from "@/components/slide-surface";
import { resolveContactSyncCopy } from "@/i18n/contact-sync-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { refreshCoinWallet } from "@/lib/coin-wallet-client";
import {
  filterContacts,
  isNativeContactsSupported,
  postNativeContactsCheck,
  postNativeContactsRequest,
  postNativeSmsCompose,
  readInvitedPhones,
  subscribeNativeContacts,
  writeInvitedPhones,
  type NativeContact,
  type NativeContactsPermission,
} from "@/lib/native-contacts";
import { postNativeLocationSettings } from "@/lib/native-location";
import { buildProfileLinkUrl } from "@/lib/profile-link";
import { fillReferralInviteMessage, normalizeReferralCode, REFERRAL_CODE_LENGTH } from "@/lib/referral-code";

type ContactSyncScreenProps = {
  open: boolean;
  onClose: () => void;
  locale: string;
  /** Opened by itself right after signup: adds a "Maybe later" button. */
  prompt?: boolean;
};

type ReferralState = {
  code: string;
  redeemed: boolean;
};

// Rows drawn at once; the rest appear as the list is scrolled.
const CONTACT_PAGE_SIZE = 80;

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

export default function ContactSyncScreen({ open, onClose, locale, prompt = false }: ContactSyncScreenProps) {
  const { data: session } = useSession();
  const copy = useMemo(() => resolveContactSyncCopy(locale), [locale]);
  const fill = useCallback(
    (template: string) => fillReferralInviteMessage(template, { name: "", code: "", link: "" }),
    [],
  );

  const [referral, setReferral] = useState<ReferralState | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);

  const [nativeSupported, setNativeSupported] = useState(false);
  const [permission, setPermission] = useState<NativeContactsPermission | "unknown">("unknown");
  const [contacts, setContacts] = useState<NativeContact[] | null>(null);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(CONTACT_PAGE_SIZE);
  const [invitedPhones, setInvitedPhones] = useState<Set<string>>(() => new Set());
  const requestSequenceRef = useRef(0);
  const pendingRequestIdRef = useRef("");

  const userId = session?.user?.id ?? "";
  const senderName = session?.user?.name?.trim() || "HashChat";

  const inviteMessage = useMemo(() => {
    if (!referral?.code || typeof window === "undefined") return "";
    return fillReferralInviteMessage(copy.inviteMessage, {
      name: senderName,
      code: referral.code,
      link: (userId && buildProfileLinkUrl(window.location.origin, userId)) || window.location.origin,
    });
  }, [copy.inviteMessage, referral?.code, senderName, userId]);

  const loadContacts = useCallback(() => {
    requestSequenceRef.current += 1;
    const requestId = `contacts-${requestSequenceRef.current}`;
    pendingRequestIdRef.current = requestId;
    setIsLoadingContacts(true);
    if (!postNativeContactsRequest(requestId)) setIsLoadingContacts(false);
  }, []);

  // Everything the screen needs is read when it opens, so a reopen shows fresh state.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(buildClientApiPath("/referral"), { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json() as Partial<ReferralState>;
        if (!cancelled && typeof body.code === "string") {
          setReferral({ code: body.code, redeemed: body.redeemed === true });
        }
      } catch {
        // The code card stays on its loading state; contacts still work.
      }
    })();

    const supported = isNativeContactsSupported();
    // Deferred out of the effect body (react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      if (cancelled) return;
      setNativeSupported(supported);
      setInvitedPhones(readInvitedPhones());
    });
    if (!supported) return () => { cancelled = true; };

    const unsubscribe = subscribeNativeContacts((event) => {
      if (event.type === "permission") {
        setPermission(event.permission);
        if (event.requestId === "contacts-check") {
          // Already allowed earlier: show the list without another tap.
          if (event.permission === "granted") loadContacts();
        } else if (event.permission !== "granted") {
          setIsLoadingContacts(false);
        }
        return;
      }
      if (event.requestId && event.requestId !== pendingRequestIdRef.current) return;
      setIsLoadingContacts(false);
      if (event.type === "contacts") {
        setContacts(Array.isArray(event.contacts) ? event.contacts : []);
        setVisibleCount(CONTACT_PAGE_SIZE);
      }
    });
    postNativeContactsCheck("contacts-check");
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loadContacts, open]);

  const handleCopy = useCallback(async (value: string, message: string) => {
    if (!value) return;
    if (await copyText(value)) toast(message);
  }, []);

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
        body: JSON.stringify({ code }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (response.ok) {
        setReferral((current) => (current ? { ...current, redeemed: true } : current));
        setCodeInput("");
        toast(fill(copy.redeemSuccess));
        void refreshCoinWallet({ force: true });
        return;
      }
      if (body.error === "already_redeemed") {
        setReferral((current) => (current ? { ...current, redeemed: true } : current));
      }
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
  }, [codeInput, copy, fill, isRedeeming]);

  const handleInvite = useCallback((contact: NativeContact) => {
    const phone = contact.phones[0];
    if (!phone || !inviteMessage) return;
    if (!postNativeSmsCompose([phone], inviteMessage)) return;
    setInvitedPhones((current) => {
      const next = new Set(current);
      next.add(phone);
      writeInvitedPhones(next);
      return next;
    });
  }, [inviteMessage]);

  const filteredContacts = useMemo(() => filterContacts(contacts ?? [], query), [contacts, query]);
  const visibleContacts = filteredContacts.slice(0, visibleCount);

  const handleListScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (element.scrollHeight - element.scrollTop - element.clientHeight > 600) return;
    setVisibleCount((count) => (count < filteredContacts.length ? count + CONTACT_PAGE_SIZE : count));
  }, [filteredContacts.length]);

  const permissionBlocked = permission === "blocked";

  return (
    <SlideSurface
      open={open}
      onClose={onClose}
      ariaLabel={copy.title}
      zIndex={130}
      nativeBackPriority={130}
      className="fixed inset-0 z-[130] flex min-h-0 w-full flex-col bg-white text-slate-950"
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
        <h2 className="truncate text-center text-[17px] font-bold">{copy.title}</h2>
        <div aria-hidden="true" />
      </header>

      <div
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 pt-5"
        style={{ paddingBottom: "calc(28px + env(safe-area-inset-bottom, 0px))" }}
        onScroll={handleListScroll}
      >
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
          <div className="flex items-start gap-3">
            <Gift size={22} strokeWidth={2} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[16px] font-bold leading-snug">{copy.headline}</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-amber-900/80">{fill(copy.description)}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-white px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-gray-500">{copy.myCodeLabel}</p>
              <p className="mt-0.5 font-mono text-[24px] font-bold tracking-[0.22em] text-slate-950" data-testid="contact-sync-my-code">
                {referral?.code ?? "·····"}
              </p>
            </div>
            <button
              type="button"
              disabled={!referral?.code}
              onClick={() => void handleCopy(referral?.code ?? "", copy.codeCopied)}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-slate-950 px-4 text-[13.5px] font-semibold text-white transition active:opacity-80 disabled:opacity-40"
            >
              <Copy size={15} strokeWidth={2.2} aria-hidden="true" />
              {copy.copyCode}
            </button>
          </div>
          <button
            type="button"
            disabled={!inviteMessage}
            onClick={() => void handleCopy(inviteMessage, copy.messageCopied)}
            className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white/60 text-[14px] font-semibold text-amber-900 transition active:bg-white disabled:opacity-40"
          >
            <MessageSquareText size={17} strokeWidth={2} aria-hidden="true" />
            {copy.copyMessage}
          </button>
        </section>

        <section className="mt-4 rounded-2xl border border-gray-100 px-4 py-4">
          <p className="text-[14px] font-bold">{copy.enterCodeLabel}</p>
          {referral?.redeemed ? (
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

        <section className="mt-4">
          {!nativeSupported ? (
            <p className="rounded-2xl bg-gray-50 px-4 py-4 text-center text-[13.5px] leading-relaxed text-gray-500">{copy.appOnly}</p>
          ) : contacts === null ? (
            <div className="rounded-2xl border border-gray-100 px-4 py-5 text-center">
              <Users size={30} strokeWidth={1.8} className="mx-auto text-gray-400" aria-hidden="true" />
              <p className="mt-2 text-[13px] leading-relaxed text-gray-500">
                {permissionBlocked ? copy.permissionBlocked : copy.privacyNote}
              </p>
              <button
                type="button"
                disabled={isLoadingContacts}
                onClick={permissionBlocked ? () => { postNativeLocationSettings(); } : loadContacts}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-[15px] font-bold text-white transition active:bg-blue-700 disabled:opacity-60"
              >
                {isLoadingContacts ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : null}
                {permissionBlocked ? copy.openSettings : copy.syncButton}
              </button>
            </div>
          ) : (
            <>
              <label className="flex h-11 items-center gap-2 rounded-xl bg-gray-100 px-3.5">
                <Search size={17} strokeWidth={2} className="shrink-0 text-gray-400" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setVisibleCount(CONTACT_PAGE_SIZE);
                  }}
                  placeholder={copy.searchPlaceholder}
                  aria-label={copy.searchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-gray-400"
                />
                {query ? (
                  <button type="button" onClick={() => setQuery("")} aria-label={copy.searchPlaceholder} className="shrink-0 text-gray-400">
                    <X size={17} strokeWidth={2} aria-hidden="true" />
                  </button>
                ) : null}
              </label>
              <p className="mt-2 px-1 text-[12px] leading-relaxed text-gray-400">{copy.privacyNote}</p>
              {filteredContacts.length === 0 ? (
                <p className="py-10 text-center text-[14px] text-gray-400">
                  {contacts.length === 0 ? copy.noContacts : copy.noResults}
                </p>
              ) : (
                <ul className="mt-1">
                  {visibleContacts.map((contact) => {
                    const phone = contact.phones[0] ?? "";
                    const invited = invitedPhones.has(phone);
                    return (
                      <li key={contact.id} className="flex items-center gap-3 border-b border-gray-50 py-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100">
                          <UserRound size={21} className="text-gray-400" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold">{contact.name}</p>
                          <p className="truncate text-[13px] text-gray-500" dir="ltr">{phone}</p>
                        </div>
                        <button
                          type="button"
                          disabled={!inviteMessage}
                          onClick={() => handleInvite(contact)}
                          className={invited
                            ? "h-9 shrink-0 rounded-full border border-gray-200 px-4 text-[13.5px] font-semibold text-gray-500 transition active:bg-gray-50"
                            : "h-9 shrink-0 rounded-full bg-blue-600 px-4 text-[13.5px] font-semibold text-white transition active:bg-blue-700 disabled:opacity-40"}
                        >
                          {invited ? copy.invited : copy.invite}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </section>

        {prompt ? (
          <button
            type="button"
            onClick={onClose}
            className="mt-4 flex h-11 w-full items-center justify-center rounded-xl text-[14px] font-medium text-gray-500 transition active:bg-gray-50"
          >
            {copy.later}
          </button>
        ) : null}
      </div>
    </SlideSurface>
  );
}
