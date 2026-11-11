"use client";

import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { hasConfirmedLanguageOnboarding } from "@/components/LivePhoneDemo/language-onboarding.storage";
// The config module, not the "@/i18n" barrel (see coin-host.tsx).
import { DEFAULT_LOCALE, resolveSupportedLocaleTag, type AppLocale } from "@/i18n/config";
import { runAfterStartup } from "@/lib/after-startup";
import { buildClientApiPath } from "@/lib/api-contract";
import {
  CONTACT_SYNC_OPEN_EVENT,
  CONTACT_SYNC_PROMPT_CHECK_EVENT,
  isNativeContactsSupported,
} from "@/lib/native-contacts";

const ContactSyncScreen = dynamic(() => import("@/components/contacts/contact-sync-screen"), { ssr: false });

// The shell reports what it can do at load end, which can come after this
// component's first check: look again a few times before giving up.
const PROMPT_CHECK_RETRY_MS = 2_000;
const PROMPT_CHECK_ATTEMPTS = 4;

/**
 * Mounted once in the root layout. Owns the contact-sync screen: opened from
 * the My page menu and the follow list through CONTACT_SYNC_OPEN_EVENT, and
 * opened by itself once for someone who just signed up (in an app that can
 * read contacts, after onboarding is finished).
 */
export default function ContactSyncHost() {
  const { status } = useSession();
  const pathname = usePathname() || "";
  const locale: AppLocale = resolveSupportedLocaleTag(pathname.split("/").filter(Boolean)[0] ?? "") ?? DEFAULT_LOCALE;
  const signedIn = status === "authenticated";
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(false);
  const promptSettledRef = useRef(false);
  const promptCheckingRef = useRef(false);

  const checkPrompt = useCallback(async (): Promise<boolean> => {
    if (promptSettledRef.current || promptCheckingRef.current) return true;
    if (!hasConfirmedLanguageOnboarding()) return true;
    if (!isNativeContactsSupported()) return false;
    promptCheckingRef.current = true;
    try {
      const response = await fetch(buildClientApiPath("/referral"), { cache: "no-store" });
      if (!response.ok) return true;
      const body = await response.json() as { shouldPromptContactSync?: unknown };
      promptSettledRef.current = true;
      if (body.shouldPromptContactSync !== true) return true;
      setPrompt(true);
      setMounted(true);
      setOpen(true);
      // Shown once per account, whatever the person does with it.
      void fetch(buildClientApiPath("/referral"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactSyncPrompted: true }),
      }).catch(() => {});
      return true;
    } catch {
      return true;
    } finally {
      promptCheckingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const handleOpen = () => {
      setPrompt(false);
      setMounted(true);
      setOpen(true);
    };
    window.addEventListener(CONTACT_SYNC_OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(CONTACT_SYNC_OPEN_EVENT, handleOpen);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    let timer: number | null = null;
    const run = (attempt: number) => {
      if (cancelled) return;
      void checkPrompt().then((settled) => {
        if (settled || cancelled || attempt >= PROMPT_CHECK_ATTEMPTS) return;
        timer = window.setTimeout(() => run(attempt + 1), PROMPT_CHECK_RETRY_MS);
      });
    };
    const cancelStartup = runAfterStartup(() => run(1));
    const handleCheck = () => run(1);
    window.addEventListener(CONTACT_SYNC_PROMPT_CHECK_EVENT, handleCheck);
    return () => {
      cancelled = true;
      cancelStartup();
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener(CONTACT_SYNC_PROMPT_CHECK_EVENT, handleCheck);
    };
  }, [checkPrompt, signedIn]);

  if (!mounted || !signedIn) return null;
  return <ContactSyncScreen open={open} onClose={() => setOpen(false)} locale={locale} prompt={prompt} />;
}
