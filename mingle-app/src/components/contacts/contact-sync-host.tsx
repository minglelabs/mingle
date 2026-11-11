"use client";

import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { hasConfirmedLanguageOnboarding } from "@/components/LivePhoneDemo/language-onboarding.storage";
// The config module, not the "@/i18n" barrel (see coin-host.tsx).
import { DEFAULT_LOCALE, resolveSupportedLocaleTag, type AppLocale } from "@/i18n/config";
import { fillInviteTicketCopy, resolveInviteTicketCopy } from "@/i18n/invite-ticket-copy";
import { runAfterStartup } from "@/lib/after-startup";
import { isFirstSpeakPending } from "@/lib/first-run";
import { buildClientApiPath } from "@/lib/api-contract";
import { refreshCoinWallet } from "@/lib/coin-wallet-client";
import { replaceWithConversationListThenPush } from "@/lib/direct-conversation-navigation";
import {
  CONTACT_SYNC_OPEN_EVENT,
  CONTACT_SYNC_PROMPT_CHECK_EVENT,
  isNativeContactsSupported,
} from "@/lib/native-contacts";
import {
  INVITE_TICKET_OPEN_EVENT,
  NATIVE_INVITE_EVENT,
  clearPendingInvite,
  consumeWindowInvite,
  parseNativeInviteDetail,
  readPendingInvite,
  storePendingInvite,
} from "@/lib/native-invite";
import { captureMingleClientEvent } from "@/lib/posthog-client";

const ContactSyncScreen = dynamic(() => import("@/components/contacts/contact-sync-screen"), { ssr: false });
const InviteTicketSheet = dynamic(() => import("@/components/contacts/invite-ticket-sheet"), { ssr: false });

/**
 * Mounted once in the root layout. Owns three things around invites:
 *
 * - The invite a person arrived with (a tapped invite link, or the Play
 *   install referrer): kept on the device until they are signed in and through
 *   onboarding, then accepted, and the room with the inviter opens.
 * - The "send an invite ticket" sheet (INVITE_TICKET_OPEN_EVENT).
 * - The contact-sync screen: opened from the My page menu and the follow list
 *   (CONTACT_SYNC_OPEN_EVENT), and once by itself in the app for someone who
 *   just signed up without an invite — it is also where an invite code is typed.
 */
export default function ContactSyncHost() {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname() || "";
  const locale: AppLocale = resolveSupportedLocaleTag(pathname.split("/").filter(Boolean)[0] ?? "") ?? DEFAULT_LOCALE;
  const localeRef = useRef(locale);
  const signedIn = status === "authenticated";
  const [screenMounted, setScreenMounted] = useState(false);
  const [screenOpen, setScreenOpen] = useState(false);
  const [prompt, setPrompt] = useState(false);
  const [ticketMounted, setTicketMounted] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const promptSettledRef = useRef(false);
  const busyRef = useRef(false);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  /** Accepts the pending invite. true = there was one (nothing else should open now). */
  const acceptPendingInvite = useCallback(async (): Promise<boolean> => {
    const pending = readPendingInvite();
    if (!pending) return false;
    try {
      const response = await fetch(buildClientApiPath("/referral/redeem"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: pending.code, source: pending.source, openRoom: true, locale: localeRef.current }),
      });
      // 5xx or a lost connection: keep the invite and try again on the next launch.
      if (response.status >= 500) return true;
      clearPendingInvite();
      if (!response.ok) return false;
      const body = await response.json() as {
        rewarded?: boolean; conversationId?: string | null; inviterName?: string | null;
      };
      const copy = resolveInviteTicketCopy(localeRef.current);
      if (body.rewarded) void refreshCoinWallet({ force: true });
      if (!body.conversationId) return false;
      captureMingleClientEvent("mingle_invite_room_opened", { source: pending.source, rewarded: body.rewarded === true });
      toast(fillInviteTicketCopy(copy.joinedToast, { name: body.inviterName?.trim() || copy.userFallback }));
      replaceWithConversationListThenPush(router, `/${localeRef.current}/conversations`, body.conversationId);
      return true;
    } catch {
      return true;
    }
  }, [router]);

  /** Runs what is due once the person is signed in and through onboarding. */
  const runPostSignup = useCallback(async () => {
    if (busyRef.current || !hasConfirmedLanguageOnboarding()) return;
    busyRef.current = true;
    try {
      if (await acceptPendingInvite()) return;
      // Only an app that can read contacts gets the prompt: a browser has none
      // to offer, and an older app shell (before the contacts module) would
      // show a dead screen and use up the one-time prompt before an update.
      if (promptSettledRef.current || !isNativeContactsSupported()) return;
      // A new user is first asked to say something (the first-run card on the
      // conversation list). This screen would cover that card, so it waits
      // until they have left their first room, which asks again.
      if (isFirstSpeakPending()) return;
      const response = await fetch(buildClientApiPath("/referral"), { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json() as { shouldPromptContactSync?: unknown };
      promptSettledRef.current = true;
      if (body.shouldPromptContactSync !== true) return;
      setPrompt(true);
      setScreenMounted(true);
      setScreenOpen(true);
      // Shown once per account, whatever the person does with it.
      void fetch(buildClientApiPath("/referral"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactSyncPrompted: true }),
      }).catch(() => {});
    } catch {
      // Tried again on the next launch.
    } finally {
      busyRef.current = false;
    }
  }, [acceptPendingInvite]);

  const signedInRef = useRef(signedIn);
  useEffect(() => {
    signedInRef.current = signedIn;
  }, [signedIn]);

  // Invites from the shell are remembered whether or not anyone is signed in yet.
  useEffect(() => {
    const remember = (invite: ReturnType<typeof parseNativeInviteDetail>) => {
      if (!invite) return;
      storePendingInvite(invite);
      captureMingleClientEvent("mingle_invite_received", { source: invite.source });
      if (signedInRef.current) void runPostSignup();
    };
    const handleInvite = (event: Event) => {
      consumeWindowInvite();
      remember(parseNativeInviteDetail((event as CustomEvent<unknown>).detail));
    };
    remember(consumeWindowInvite());
    window.addEventListener(NATIVE_INVITE_EVENT, handleInvite);

    const openScreen = () => {
      setPrompt(false);
      setScreenMounted(true);
      setScreenOpen(true);
    };
    const openTicket = () => {
      setTicketMounted(true);
      setTicketOpen(true);
    };
    window.addEventListener(CONTACT_SYNC_OPEN_EVENT, openScreen);
    window.addEventListener(INVITE_TICKET_OPEN_EVENT, openTicket);
    return () => {
      window.removeEventListener(NATIVE_INVITE_EVENT, handleInvite);
      window.removeEventListener(CONTACT_SYNC_OPEN_EVENT, openScreen);
      window.removeEventListener(INVITE_TICKET_OPEN_EVENT, openTicket);
    };
  }, [runPostSignup]);

  useEffect(() => {
    if (!signedIn) return;
    const run = () => { void runPostSignup(); };
    const cancelStartup = runAfterStartup(run);
    // Sent when onboarding is confirmed (conversation list, feed sign-in gate).
    window.addEventListener(CONTACT_SYNC_PROMPT_CHECK_EVENT, run);
    return () => {
      cancelStartup();
      window.removeEventListener(CONTACT_SYNC_PROMPT_CHECK_EVENT, run);
    };
  }, [runPostSignup, signedIn]);

  if (!signedIn) return null;
  return (
    <>
      {screenMounted ? (
        <ContactSyncScreen open={screenOpen} onClose={() => setScreenOpen(false)} locale={locale} prompt={prompt} />
      ) : null}
      {ticketMounted ? (
        <InviteTicketSheet open={ticketOpen} onClose={() => setTicketOpen(false)} locale={locale} />
      ) : null}
    </>
  );
}
