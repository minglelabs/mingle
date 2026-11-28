"use client";

import { appAccessQuery, markKoreanAnswerSynced, writeKoreanAnswer } from "@/lib/korean-signup";
import { Smartphone } from "lucide-react";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import PhoneVerifySheet from "@/components/contacts/phone-verify-sheet";
import { resolvePhoneFriendsCopy } from "@/i18n/phone-friends-copy";
import { resolvePhoneGateCopy } from "@/i18n/phone-gate-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { resolveDeviceIdentityHeaders } from "@/lib/native-device-identity";
import { requestContactSyncPromptCheck } from "@/lib/native-contacts";
import { captureMingleClientEvent } from "@/lib/posthog-client";
import { requestProfileBasics } from "@/lib/profile-basics";
import { useNativeBannerSuppression } from "@/lib/use-native-banner-suppression";

type Access = { allowed: boolean; reason: string };

/**
 * Shown over the app after sign-in when the account has no verified phone
 * number yet (PHONE_REQUIRED on the server; reason "needs_phone"). The number
 * is proved with the same SMS sheet the contact sync uses. Once it is saved,
 * the server is asked again, so the invite gate can still follow.
 */
export default function PhoneGate({
  locale,
  onAccess,
  inKorea = false,
}: {
  locale: string;
  onAccess: (access: Access) => void;
  /**
   * The server answered "needs_phone_in_korea": "no Korean number" was said
   * from Korea (IP), where the number is still needed (owner, 2026-11-28).
   * The gate says why and no longer offers the way around it.
   */
  inKorea?: boolean;
}) {
  const copy = useMemo(() => resolvePhoneGateCopy(locale), [locale]);
  const sheetCopy = useMemo(() => resolvePhoneFriendsCopy(locale), [locale]);
  const [sheetOpen, setSheetOpen] = useState(false);
  // The native banner draws above the WebView and would cover the gate.
  useNativeBannerSuppression(true);

  useEffect(() => {
    captureMingleClientEvent("mingle_first_run_step", { step: "phone_gate_shown" });
  }, []);

  const handleVerified = useCallback(async (passedBy: "number" | "not_korean" = "number") => {
    setSheetOpen(false);
    if (passedBy === "number") captureMingleClientEvent("mingle_first_run_step", { step: "phone_gate_passed" });
    try {
      const response = await fetch(`${buildClientApiPath("/account/access")}?${appAccessQuery(locale)}`, { cache: "no-store", headers: await resolveDeviceIdentityHeaders() });
      const body = response.ok ? await response.json() as Partial<Access> : null;
      if (body && typeof body.allowed === "boolean") {
        onAccess({ allowed: body.allowed, reason: body.reason ?? "unknown" });
        // Next step after the number: gender and birth date, if the profile
        // still lacks them (the same two screens a first follow would show).
        // Not while the invite gate is still in the way.
        // Then the contact sync (Korean sign-ups must pass it, see contact-sync-host).
        if (body.allowed) void requestProfileBasics().finally(() => requestContactSyncPromptCheck());
        return;
      }
    } catch {
      // The number is saved; open the app rather than keep a verified user here.
    }
    onAccess({ allowed: true, reason: "unknown" });
    requestContactSyncPromptCheck();
  }, [locale, onAccess]);

  // Tapped "Korean" by mistake on the first screen (2026-11-21): the number is
  // asked of Koreans only, so the answer is corrected and the gate asked again.
  const [isLeavingAsForeigner, setIsLeavingAsForeigner] = useState(false);
  const handleNotKorean = useCallback(async () => {
    if (isLeavingAsForeigner) return;
    setIsLeavingAsForeigner(true);
    writeKoreanAnswer("no");
    captureMingleClientEvent("mingle_first_run_step", { step: "phone_gate_not_korean" });
    // "한국 전화번호가 없어요" (owner, 2026-11-25): only the phone step is
    // dropped; the nationality picked on the first screen stays.
    markKoreanAnswerSynced();
    await handleVerified("not_korean");
    setIsLeavingAsForeigner(false);
  }, [handleVerified, isLeavingAsForeigner]);

  return (
    <div
      data-qa="phone-gate"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      className="absolute inset-0 z-[210] flex flex-col overflow-y-auto bg-gradient-to-b from-[#FBBC32] to-[#F97316] px-6"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 72px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
    >
      <div className="flex flex-1 flex-col items-center text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/90 text-[#F97316] shadow-lg">
          <Smartphone size={30} strokeWidth={2.2} aria-hidden />
        </span>
        <h1 className="mt-6 text-[1.5rem] font-extrabold leading-tight text-slate-950">{copy.title}</h1>
        <p className="mt-3 max-w-[340px] text-[0.95rem] leading-relaxed text-slate-900/80">{copy.body}</p>
        <button
          type="button"
          data-qa="phone-gate-start"
          onClick={() => setSheetOpen(true)}
          className="mt-8 flex h-14 w-full max-w-[360px] items-center justify-center rounded-2xl bg-slate-950 text-[1rem] font-extrabold text-white transition active:scale-[0.985]"
        >
          {copy.start}
        </button>
        {inKorea ? (
          <p role="alert" data-qa="phone-gate-in-korea" className="mt-5 max-w-[360px] rounded-2xl bg-white/90 px-4 py-3 text-[0.95rem] font-semibold leading-relaxed text-slate-950">
            {copy.inKorea}
          </p>
        ) : (
        <button
          type="button"
          data-qa="phone-gate-not-korean"
          disabled={isLeavingAsForeigner}
          onClick={() => void handleNotKorean()}
          className="mt-4 h-11 px-4 text-[0.95rem] font-bold text-slate-950/80 underline underline-offset-4 disabled:opacity-50"
        >
          {copy.notKorean}
        </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        className="mx-auto mt-6 text-[0.9rem] font-semibold text-slate-900/70 underline underline-offset-4"
      >
        {copy.signOut}
      </button>
      {sheetOpen ? (
        <PhoneVerifySheet
          copy={sheetCopy}
          locale={locale}
          onClose={() => setSheetOpen(false)}
          onVerified={() => void handleVerified()}
        />
      ) : null}
    </div>
  );
}
