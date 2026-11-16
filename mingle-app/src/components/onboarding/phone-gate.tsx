"use client";

import { Smartphone } from "lucide-react";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import PhoneVerifySheet from "@/components/contacts/phone-verify-sheet";
import { resolvePhoneFriendsCopy } from "@/i18n/phone-friends-copy";
import { resolvePhoneGateCopy } from "@/i18n/phone-gate-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { captureMingleClientEvent } from "@/lib/posthog-client";
import { useNativeBannerSuppression } from "@/lib/use-native-banner-suppression";

type Access = { allowed: boolean; reason: string };

/**
 * Shown over the app after sign-in when the account has no verified phone
 * number yet (PHONE_REQUIRED on the server; reason "needs_phone"). The number
 * is proved with the same SMS sheet the contact sync uses. Once it is saved,
 * the server is asked again, so the invite gate can still follow.
 */
export default function PhoneGate({ locale, onAccess }: { locale: string; onAccess: (access: Access) => void }) {
  const copy = useMemo(() => resolvePhoneGateCopy(locale), [locale]);
  const sheetCopy = useMemo(() => resolvePhoneFriendsCopy(locale), [locale]);
  const [sheetOpen, setSheetOpen] = useState(false);
  // The native banner draws above the WebView and would cover the gate.
  useNativeBannerSuppression(true);

  useEffect(() => {
    captureMingleClientEvent("mingle_first_run_step", { step: "phone_gate_shown" });
  }, []);

  const handleVerified = useCallback(async () => {
    setSheetOpen(false);
    captureMingleClientEvent("mingle_first_run_step", { step: "phone_gate_passed" });
    try {
      const response = await fetch(`${buildClientApiPath("/account/access")}?locale=${encodeURIComponent(locale)}`, { cache: "no-store" });
      const body = response.ok ? await response.json() as Partial<Access> : null;
      if (body && typeof body.allowed === "boolean") {
        onAccess({ allowed: body.allowed, reason: body.reason ?? "unknown" });
        return;
      }
    } catch {
      // The number is saved; open the app rather than keep a verified user here.
    }
    onAccess({ allowed: true, reason: "unknown" });
  }, [locale, onAccess]);

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
