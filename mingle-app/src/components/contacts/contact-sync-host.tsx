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
import LazyOverlayBoundary from "@/components/lazy-overlay-boundary";
import { runAfterStartup } from "@/lib/after-startup";
import { isFirstSpeakPending } from "@/lib/first-run";
import { appAccessQuery, isKoreanAnswerUnsynced, isKoreanUser, markKoreanAnswerSynced, readKoreanAnswer, readNationalityAnswer } from "@/lib/korean-signup";
import { resolveDeviceIdentityHeaders } from "@/lib/native-device-identity";
import { buildClientApiPath } from "@/lib/api-contract";
import { refreshCoinWallet } from "@/lib/coin-wallet-client";
import { replaceWithConversationListThenPush } from "@/lib/direct-conversation-navigation";
import {
  CONTACT_SYNC_OPEN_EVENT,
  CONTACT_SYNC_PROMPT_CHECK_EVENT,
  isNativeContactsSupported,
} from "@/lib/native-contacts";
import {
  INVITE_SCREEN_OPEN_EVENT,
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
const InviteScreen = dynamic(() => import("@/components/contacts/invite-screen"), { ssr: false });

/**
 * Mounted once in the root layout. Owns three things around invites:
 *
 * - The invite a person arrived with (a tapped invite link, or the Play
 *   install referrer): kept on the device until they are signed in and through
 *   onboarding, then accepted, and the room with the inviter opens.
 * - The "send an invite ticket" sheet (INVITE_TICKET_OPEN_EVENT) and the
 *   invite page with code entry (INVITE_SCREEN_OPEN_EVENT, from My Page).
 * - The contact-sync screen: opened from the My page menu and the follow list
 *   (CONTACT_SYNC_OPEN_EVENT), and once by itself in the app for someone who
 *   just signed up without an invite. It links to the invite page, where a code is typed.
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
  const [required, setRequired] = useState(false);
  const [ticketMounted, setTicketMounted] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [inviteScreenMounted, setInviteScreenMounted] = useState(false);
  const [inviteScreenOpen, setInviteScreenOpen] = useState(false);
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

  /**
   * Saves the first screen's "Are you Korean?" answer on the profile as its
   * nationality: yes = KR; no = the country picked next (2026-11-24), or,
   * without one (older first runs), clears a KR guessed from the language.
   */
  const syncKoreanAnswer = useCallback(async () => {
    if (!isKoreanAnswerUnsynced()) return;
    const answer = readKoreanAnswer();
    try {
      let nationalityCountry: string | null | undefined;
      const pickedCountry = readNationalityAnswer();
      if (answer === "yes") {
        nationalityCountry = "KR";
      } else if (pickedCountry && pickedCountry !== "KR") {
        nationalityCountry = pickedCountry;
      } else {
        const profileResponse = await fetch(buildClientApiPath("/profile"), { cache: "no-store" });
        if (!profileResponse.ok) return;
        const profile = await profileResponse.json() as { nationalityCountry?: unknown };
        nationalityCountry = profile.nationalityCountry === "KR" ? null : undefined;
      }
      if (nationalityCountry !== undefined) {
        const response = await fetch(buildClientApiPath("/profile"), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nationalityCountry }),
        });
        if (!response.ok) return;
      }
      markKoreanAnswerSynced();
    } catch {
      // Tried again on the next launch.
    }
  }, []);

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
      // Korean sign-ups (2026-11-21) get the screen right after sign-up, once
      // their number is verified (the phone gate asks again when it closes);
      // they already tried the interpreter before signing in.
      const requiredHere = isKoreanUser(localeRef.current);
      // Everyone else is first asked to say something (the first-run card on
      // the conversation list). This screen would cover that card, so it
      // waits until they have left their first room, which asks again.
      if (!requiredHere && isFirstSpeakPending()) return;
      const response = await fetch(buildClientApiPath("/referral"), { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json() as { shouldPromptContactSync?: unknown };
      if (body.shouldPromptContactSync !== true) {
        promptSettledRef.current = true;
        return;
      }
      if (requiredHere) {
        // Not over the phone gate (or the invite gate): asked again when it closes.
        const accessResponse = await fetch(
          `${buildClientApiPath("/account/access")}?${appAccessQuery(localeRef.current)}`,
          { cache: "no-store", headers: await resolveDeviceIdentityHeaders() },
        );
        const access = accessResponse.ok ? await accessResponse.json() as { allowed?: unknown } : null;
        if (access?.allowed !== true) return;
      }
      promptSettledRef.current = true;
      setPrompt(true);
      setRequired(requiredHere);
      setScreenMounted(true);
      setScreenOpen(true);
      captureMingleClientEvent("mingle_first_run_step", { step: requiredHere ? "contact_sync_required_shown" : "contact_sync_prompt_shown" });
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
      setRequired(false);
      setScreenMounted(true);
      setScreenOpen(true);
    };
    const openTicket = () => {
      setTicketMounted(true);
      setTicketOpen(true);
    };
    window.addEventListener(CONTACT_SYNC_OPEN_EVENT, openScreen);
    const openInviteScreenNow = () => {
      setInviteScreenMounted(true);
      setInviteScreenOpen(true);
    };
    window.addEventListener(INVITE_TICKET_OPEN_EVENT, openTicket);
    window.addEventListener(INVITE_SCREEN_OPEN_EVENT, openInviteScreenNow);
    return () => {
      window.removeEventListener(NATIVE_INVITE_EVENT, handleInvite);
      window.removeEventListener(CONTACT_SYNC_OPEN_EVENT, openScreen);
      window.removeEventListener(INVITE_TICKET_OPEN_EVENT, openTicket);
      window.removeEventListener(INVITE_SCREEN_OPEN_EVENT, openInviteScreenNow);
    };
  }, [runPostSignup]);

  useEffect(() => {
    if (!signedIn) return;
    const run = () => { void syncKoreanAnswer(); void runPostSignup(); };
    const cancelStartup = runAfterStartup(run);
    // Sent when onboarding is confirmed (conversation list, feed sign-in gate).
    window.addEventListener(CONTACT_SYNC_PROMPT_CHECK_EVENT, run);
    return () => {
      cancelStartup();
      window.removeEventListener(CONTACT_SYNC_PROMPT_CHECK_EVENT, run);
    };
  }, [runPostSignup, signedIn, syncKoreanAnswer]);

  if (!signedIn) return null;
  return (
    <>
      {screenMounted ? (
        <LazyOverlayBoundary onFail={() => { setScreenOpen(false); setScreenMounted(false); }}>
          <ContactSyncScreen open={screenOpen} onClose={() => setScreenOpen(false)} locale={locale} prompt={prompt} required={required} />
        </LazyOverlayBoundary>
      ) : null}
      {ticketMounted ? (
        <LazyOverlayBoundary onFail={() => { setTicketOpen(false); setTicketMounted(false); }}>
          <InviteTicketSheet open={ticketOpen} onClose={() => setTicketOpen(false)} locale={locale} />
        </LazyOverlayBoundary>
      ) : null}
      {inviteScreenMounted ? (
        <LazyOverlayBoundary onFail={() => { setInviteScreenOpen(false); setInviteScreenMounted(false); }}>
          <InviteScreen open={inviteScreenOpen} onClose={() => setInviteScreenOpen(false)} locale={locale} />
        </LazyOverlayBoundary>
      ) : null}
    </>
  );
}
