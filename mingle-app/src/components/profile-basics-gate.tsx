"use client";

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import type {
  LanguageOnboardingConfirmPayload,
  OnboardingStep,
} from "@/components/LivePhoneDemo/LanguageOnboardingModal";
import { buildClientApiPath } from "@/lib/api-contract";
import { formatBirthDate } from "@/lib/birth-date";
import { captureMingleClientEvent } from "@/lib/posthog-client";
import {
  registerProfileBasicsHandler,
  resolveMissingProfileBasics,
} from "@/lib/profile-basics";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/i18n";

// Only someone who still lacks gender or birth date ever needs these screens.
const LanguageOnboardingModal = lazy(() => import("@/components/LivePhoneDemo/LanguageOnboardingModal"));

// A tap must not hang on a stalled connection; past this the action goes ahead.
const PROFILE_READ_TIMEOUT_MS = 4_000;

type PendingRequest = {
  steps: OnboardingStep[];
  resolve: (ok: boolean) => void;
};

/**
 * Shows the gender and birth date screens when `requestProfileBasics()` is
 * awaited by a follow, comment, post or profile message and the signed-in
 * profile still lacks one of them. See `@/lib/profile-basics`.
 */
export default function ProfileBasicsGate() {
  const { status } = useSession();
  const pathname = usePathname();
  const [request, setRequest] = useState<PendingRequest | null>(null);
  // Once the profile is known to be complete, later actions pass without a fetch.
  const completeRef = useRef(false);
  const statusRef = useRef(status);
  const missingReadRef = useRef<Promise<OnboardingStep[] | null> | null>(null);

  const pathLocale = pathname?.split("/")[1] ?? "";
  const locale = isSupportedLocale(pathLocale) ? pathLocale : DEFAULT_LOCALE;

  // One read of the profile, shared by every action that asks while it is in
  // flight. `null` means the read failed, which must not stop the action.
  const readMissing = useCallback((): Promise<OnboardingStep[] | null> => {
    if (missingReadRef.current) return missingReadRef.current;
    const read = (async () => {
      try {
        const response = await fetch(buildClientApiPath("/profile"), {
          cache: "no-store",
          signal: AbortSignal.timeout(PROFILE_READ_TIMEOUT_MS),
        });
        if (!response.ok) return null;
        const missing = resolveMissingProfileBasics(await response.json());
        if (missing.length === 0) completeRef.current = true;
        return missing;
      } catch {
        return null;
      } finally {
        missingReadRef.current = null;
      }
    })();
    missingReadRef.current = read;
    return read;
  }, []);

  useEffect(() => {
    statusRef.current = status;
    if (status !== "authenticated") {
      completeRef.current = false;
      return;
    }
    // Read ahead of the first tap, so opening a room or following someone
    // does not wait on the network before anything happens on screen.
    if (!completeRef.current) void readMissing();
  }, [readMissing, status]);

  useEffect(() => registerProfileBasicsHandler(async () => {
    // Signed-out actions are stopped by the sign-in gate, not here.
    if (statusRef.current !== "authenticated" || completeRef.current) return true;
    const missing = await readMissing();
    if (!missing || missing.length === 0) return true;
    captureMingleClientEvent("mingle_profile_basics_step", { step: "shown" });
    return new Promise<boolean>((resolve) => {
      setRequest((current) => {
        // A second action while the question is open is dropped.
        if (current) {
          resolve(false);
          return current;
        }
        return { steps: missing, resolve };
      });
    });
  }), [readMissing]);

  const handleClose = useCallback(() => {
    setRequest((current) => {
      current?.resolve(false);
      return null;
    });
    captureMingleClientEvent("mingle_profile_basics_step", { step: "closed" });
  }, []);

  const handleConfirm = useCallback(async (payload: LanguageOnboardingConfirmPayload) => {
    const body: Record<string, unknown> = {};
    if (payload.gender) body.gender = payload.gender;
    if (payload.birthDate) body.birthDate = formatBirthDate(payload.birthDate);
    if (payload.heightCm) body.heightCm = payload.heightCm;
    let saved = false;
    try {
      const response = await fetch(buildClientApiPath("/profile"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      saved = response.ok;
    } catch {
      saved = false;
    }
    if (!saved) return;
    completeRef.current = true;
    captureMingleClientEvent("mingle_profile_basics_step", { step: "completed" });
    setRequest((current) => {
      current?.resolve(true);
      return null;
    });
  }, []);

  if (!request) return null;

  return (
    <Suspense fallback={null}>
      <LanguageOnboardingModal
        dismissible
        onClose={handleClose}
        initialLanguage={locale}
        uiLocale={locale}
        steps={request.steps}
        onConfirm={handleConfirm}
      />
    </Suspense>
  );
}
