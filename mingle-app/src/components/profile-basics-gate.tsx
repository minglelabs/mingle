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

  const pathLocale = pathname?.split("/")[1] ?? "";
  const locale = isSupportedLocale(pathLocale) ? pathLocale : DEFAULT_LOCALE;

  useEffect(() => {
    statusRef.current = status;
    if (status !== "authenticated") completeRef.current = false;
  }, [status]);

  useEffect(() => registerProfileBasicsHandler(async () => {
    // Signed-out actions are stopped by the sign-in gate, not here.
    if (statusRef.current !== "authenticated" || completeRef.current) return true;
    let missing: OnboardingStep[];
    try {
      const response = await fetch(buildClientApiPath("/profile"), { cache: "no-store" });
      if (!response.ok) return true;
      missing = resolveMissingProfileBasics(await response.json());
    } catch {
      // A failed read must not stop a follow or a comment.
      return true;
    }
    if (missing.length === 0) {
      completeRef.current = true;
      return true;
    }
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
  }), []);

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
