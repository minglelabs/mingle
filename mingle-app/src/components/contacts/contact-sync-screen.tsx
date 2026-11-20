"use client";

import { Check, ChevronLeft, ChevronRight, Gift, Loader2, Search, ShieldCheck, Ticket, UserRound, Users, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import InviteMessageLanguagePicker from "@/components/contacts/invite-message-language-picker";
import PhoneVerifySheet, { PHONE_VERIFIED_EVENT } from "@/components/contacts/phone-verify-sheet";
import SlideSurface from "@/components/slide-surface";
import { resolveContactSyncCopy } from "@/i18n/contact-sync-copy";
import { resolveInviteTicketCopy } from "@/i18n/invite-ticket-copy";
import { fillPhoneFriendsCopy, resolvePhoneFriendsCopy } from "@/i18n/phone-friends-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { matchContactsOnServer, type MatchedContact } from "@/lib/contact-match-client";
import { formatHandle } from "@/lib/handles";
import { useInviteMessageLocale } from "@/lib/invite-message-locale";
import { openInviteScreen } from "@/lib/native-invite";
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
import { maskE164 } from "@/lib/phone-number";
import { requestProfileBasics } from "@/lib/profile-basics";
import {
  buildInviteLinkUrl,
  fillReferralInviteMessage,
  REFERRAL_REWARD_COINS,
} from "@/lib/referral-code";

type ContactSyncScreenProps = {
  open: boolean;
  onClose: () => void;
  locale: string;
  /** Opened by itself right after signup: adds a "Maybe later" button. */
  prompt?: boolean;
};

type ReferralState = {
  code: string;
  rewardCoins: number;
};

// Rows drawn at once; the rest appear as the list is scrolled.
const CONTACT_PAGE_SIZE = 80;

export default function ContactSyncScreen({ open, onClose, locale, prompt = false }: ContactSyncScreenProps) {
  const { data: session } = useSession();
  const copy = useMemo(() => resolveContactSyncCopy(locale), [locale]);
  const [referral, setReferral] = useState<ReferralState | null>(null);
  const rewardCoins = referral?.rewardCoins ?? REFERRAL_REWARD_COINS;
  const fill = useCallback(
    (template: string) => fillReferralInviteMessage(template, { name: "", code: "", link: "", coins: rewardCoins }),
    [rewardCoins],
  );
  const ticketCopy = useMemo(() => resolveInviteTicketCopy(locale), [locale]);
  // The text message to a contact is in one language the user picks (shared with the invite page).
  const [messageLocale, setMessageLocale] = useInviteMessageLocale(locale);

  const [nativeSupported, setNativeSupported] = useState(false);
  const [permission, setPermission] = useState<NativeContactsPermission | "unknown">("unknown");
  const [contacts, setContacts] = useState<NativeContact[] | null>(null);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(CONTACT_PAGE_SIZE);
  const [invitedPhones, setInvitedPhones] = useState<Set<string>>(() => new Set());
  const requestSequenceRef = useRef(0);
  const pendingRequestIdRef = useRef("");

  // Friends already on HashChat: needs the user's own verified number, then
  // the contacts' numbers are matched as hashes (see contact-match-client).
  const phoneCopy = useMemo(() => resolvePhoneFriendsCopy(locale), [locale]);
  // undefined: not read yet; null: no verified number.
  const [ownPhone, setOwnPhone] = useState<string | null | undefined>(undefined);
  const [verifySheetOpen, setVerifySheetOpen] = useState(false);
  const [matches, setMatches] = useState<MatchedContact[] | null>(null);
  const [isMatching, setIsMatching] = useState(false);
  const [followingIds, setFollowingIds] = useState<Set<string>>(() => new Set());
  const [pendingFollowIds, setPendingFollowIds] = useState<Set<string>>(() => new Set());

  // This screen can be open under the phone gate: take the number the gate just verified.
  useEffect(() => {
    const onVerified = (event: Event) => {
      const phone = (event as CustomEvent<unknown>).detail;
      if (typeof phone === "string" && phone) setOwnPhone(phone);
    };
    window.addEventListener(PHONE_VERIFIED_EVENT, onVerified);
    return () => window.removeEventListener(PHONE_VERIFIED_EVENT, onVerified);
  }, []);

  const senderName = session?.user?.name?.trim() || "HashChat";

  const inviteMessage = useMemo(() => {
    if (!referral?.code || typeof window === "undefined") return "";
    const message = fillReferralInviteMessage(resolveContactSyncCopy(messageLocale).inviteMessage, {
      name: senderName,
      code: referral.code,
      link: buildInviteLinkUrl(window.location.origin, referral.code) || window.location.origin,
      coins: rewardCoins,
    });
    // A link tapped before install is lost in the store, so say to tap it again.
    return `${message}\n${resolveInviteTicketCopy(messageLocale).reopenHint}`;
  }, [messageLocale, referral?.code, rewardCoins, senderName]);

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
          setReferral({
            code: body.code,
            rewardCoins: typeof body.rewardCoins === "number" ? body.rewardCoins : REFERRAL_REWARD_COINS,
          });
        }
      } catch {
        // The code card stays on its loading state; contacts still work.
      }
    })();

    void (async () => {
      try {
        const response = await fetch(buildClientApiPath("/phone"), { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json() as { phoneE164?: unknown; available?: unknown };
        if (cancelled) return;
        if (typeof body.phoneE164 === "string") setOwnPhone(body.phoneE164);
        // No SMS provider on this server: leave the friend-finding part out.
        else if (body.available !== false) setOwnPhone(null);
      } catch {
        // No friend matching this time; inviting still works.
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

  useEffect(() => {
    if (!open || !contacts || !ownPhone) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setIsMatching(true); });
    void matchContactsOnServer(contacts, ownPhone)
      .then((found) => {
        if (cancelled) return;
        setMatches(found);
        setFollowingIds(new Set(found.filter((match) => match.user.isFollowing).map((match) => match.user.userId)));
      })
      .catch(() => {
        if (!cancelled) setMatches([]);
      })
      .finally(() => {
        if (!cancelled) setIsMatching(false);
      });
    return () => { cancelled = true; };
  }, [contacts, open, ownPhone]);

  const handleFollow = useCallback(async (userId: string) => {
    if (pendingFollowIds.has(userId) || followingIds.has(userId)) return;
    if (!(await requestProfileBasics())) return;
    setPendingFollowIds((current) => new Set(current).add(userId));
    try {
      const response = await fetch(buildClientApiPath(`/users/${encodeURIComponent(userId)}/follow`), { method: "POST" });
      if (response.ok) setFollowingIds((current) => new Set(current).add(userId));
      else toast(phoneCopy.errorGeneric);
    } catch {
      toast(phoneCopy.errorGeneric);
    } finally {
      setPendingFollowIds((current) => {
        const next = new Set(current);
        next.delete(userId);
        return next;
      });
    }
  }, [followingIds, pendingFollowIds, phoneCopy.errorGeneric]);

  const handlePhoneVerified = useCallback((phoneE164: string) => {
    setVerifySheetOpen(false);
    setOwnPhone(phoneE164);
    toast(phoneCopy.verifiedToast);
    // Friend matching needs the address book too.
    if (!contacts && nativeSupported && permission !== "blocked") loadContacts();
  }, [contacts, loadContacts, nativeSupported, permission, phoneCopy.verifiedToast]);

  // Contacts already on HashChat are listed above, not offered an invite.
  const matchedContactIds = useMemo(() => new Set((matches ?? []).map((match) => match.contact.id)), [matches]);
  const filteredContacts = useMemo(
    () => filterContacts(contacts ?? [], query).filter((contact) => !matchedContactIds.has(contact.id)),
    [contacts, matchedContactIds, query],
  );
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
      className="keyboard-safe fixed inset-0 z-[130] flex min-h-0 w-full flex-col bg-white text-slate-950"
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
          {/* Sending a ticket, the user's own code and entering a code live on the invite page. */}
          <button
            type="button"
            onClick={openInviteScreen}
            data-testid="contact-sync-open-invite"
            className="mt-4 flex h-11 w-full items-center gap-2 rounded-xl bg-white px-4 text-left text-[14px] font-semibold text-amber-900 transition active:bg-amber-100"
          >
            <Ticket size={17} strokeWidth={2} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{ticketCopy.inviteScreenEntry}</span>
            <ChevronRight size={18} strokeWidth={2} className="shrink-0 text-amber-500" aria-hidden="true" />
          </button>
        </section>

        {nativeSupported && ownPhone !== undefined ? (
          <section className="mt-4 rounded-2xl border border-gray-100 px-4 py-4" data-testid="contact-sync-friends">
            {ownPhone === null ? (
              <>
                <div className="flex items-start gap-3">
                  <ShieldCheck size={22} strokeWidth={2} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold leading-snug">{phoneCopy.findTitle}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-gray-500">{phoneCopy.findBody}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setVerifySheetOpen(true)}
                  className="mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 text-[14.5px] font-bold text-white transition active:bg-blue-700"
                >
                  {phoneCopy.verifyButton}
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[15px] font-bold">
                    {matches ? fillPhoneFriendsCopy(phoneCopy.friendsOnHashChat, { count: matches.length }) : phoneCopy.findTitle}
                  </p>
                  <p className="shrink-0 text-[12px] text-gray-400" dir="ltr">
                    {fillPhoneFriendsCopy(phoneCopy.verifiedAs, { phone: maskE164(ownPhone) })}
                  </p>
                </div>
                {!contacts ? null : isMatching ? (
                  <p className="mt-3 flex items-center gap-2 text-[13px] text-gray-500">
                    <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                    {phoneCopy.matching}
                  </p>
                ) : matches && matches.length > 0 ? (
                  <ul className="mt-1">
                    {matches.map(({ contact, user }) => {
                      const isFollowing = followingIds.has(user.userId);
                      const isPending = pendingFollowIds.has(user.userId);
                      return (
                        <li key={user.userId} className="flex items-center gap-3 border-b border-gray-50 py-3 last:border-b-0">
                          <div className="relative h-10 w-10 shrink-0">
                            {user.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={user.image} alt="" className="h-10 w-10 rounded-full object-cover" />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                                <UserRound size={21} className="text-gray-400" aria-hidden="true" />
                              </div>
                            )}
                            <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-white bg-emerald-500">
                              <Check size={11} strokeWidth={3.4} className="text-white" aria-hidden="true" />
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-semibold">{contact.name}</p>
                            <p className="truncate text-[13px] text-gray-500">
                              {[user.name?.trim(), formatHandle(user.handle)].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={isPending || isFollowing}
                            onClick={() => void handleFollow(user.userId)}
                            className={isFollowing
                              ? "h-9 shrink-0 rounded-full border border-gray-200 px-4 text-[13.5px] font-semibold text-gray-500"
                              : "flex h-9 min-w-[72px] shrink-0 items-center justify-center rounded-full bg-slate-950 px-4 text-[13.5px] font-semibold text-white transition active:opacity-80 disabled:opacity-60"}
                          >
                            {isPending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : isFollowing ? phoneCopy.following : phoneCopy.follow}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : matches ? (
                  <p className="mt-2 text-[13px] leading-relaxed text-gray-500">{phoneCopy.noMatches}</p>
                ) : null}
              </>
            )}
          </section>
        ) : null}

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
              <InviteMessageLanguagePicker
                value={messageLocale}
                onChange={setMessageLocale}
                label={ticketCopy.messageLanguage}
                className="mt-2 px-1"
              />
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
      {verifySheetOpen ? (
        <PhoneVerifySheet
          copy={phoneCopy}
          locale={locale}
          onClose={() => setVerifySheetOpen(false)}
          onVerified={handlePhoneVerified}
        />
      ) : null}
    </SlideSurface>
  );
}
