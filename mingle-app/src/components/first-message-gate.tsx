"use client";

import { Check, ScanFace, ShieldCheck, Smartphone, X } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PhoneVerifySheet from "@/components/contacts/phone-verify-sheet";
import { resolveFirstMessageGateCopy } from "@/i18n/first-message-gate-copy";
import { resolvePhoneFriendsCopy } from "@/i18n/phone-friends-copy";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/i18n";
import { registerFirstMessageSetupHandler, type FirstMessageNeed } from "@/lib/first-message-setup";
import { captureMingleClientEvent } from "@/lib/posthog-client";
import { useNativeBannerSuppression } from "@/lib/use-native-banner-suppression";

type PendingRequest = { needs: FirstMessageNeed[]; resolve: (ok: boolean) => void };

// The selfie check loads the face library: only when it is opened, never on the server.
const SelfieVerifyScreen = dynamic(() => import("@/components/selfie-verify-screen"), { ssr: false });

const PHOTO_NEEDS: readonly FirstMessageNeed[] = ["face_photo", "face_verify", "face_check"];

/**
 * The sheet shown when a first room with someone new is refused with
 * `first_message_setup` (see @/lib/first-message-setup): verify the phone
 * number, and pass the selfie check against the profile photo (adding one
 * first when there is none). Not asked when the person follows you.
 */
export default function FirstMessageGate() {
  const pathname = usePathname();
  const pathLocale = pathname?.split("/")[1] ?? "";
  const locale = isSupportedLocale(pathLocale) ? pathLocale : DEFAULT_LOCALE;
  const copy = useMemo(() => resolveFirstMessageGateCopy(locale), [locale]);
  const phoneCopy = useMemo(() => resolvePhoneFriendsCopy(locale), [locale]);

  const [request, setRequest] = useState<PendingRequest | null>(null);
  const requestRef = useRef<PendingRequest | null>(null);
  const [needs, setNeeds] = useState<FirstMessageNeed[]>([]);
  const [phoneSheetOpen, setPhoneSheetOpen] = useState(false);
  const [selfieOpen, setSelfieOpen] = useState(false);
  useNativeBannerSuppression(request !== null);

  useEffect(() => registerFirstMessageSetupHandler((nextNeeds) => new Promise<boolean>((resolve) => {
    // A second action while the sheet is open is dropped.
    if (requestRef.current) {
      resolve(false);
      return;
    }
    const next = { needs: nextNeeds, resolve };
    requestRef.current = next;
    setRequest(next);
    setNeeds(nextNeeds);
    setSelfieOpen(false);
    captureMingleClientEvent("mingle_first_message_gate", { step: "shown", needs: nextNeeds.join(",") });
  })), []);

  const finish = useCallback((ok: boolean) => {
    const current = requestRef.current;
    requestRef.current = null;
    current?.resolve(ok);
    setRequest(null);
    setPhoneSheetOpen(false);
    setSelfieOpen(false);
    captureMingleClientEvent("mingle_first_message_gate", { step: ok ? "completed" : "closed" });
  }, []);

  const handlePhoneVerified = useCallback(() => {
    setPhoneSheetOpen(false);
    setNeeds((current) => current.filter((need) => need !== "phone"));
  }, []);

  const handleFaceVerified = useCallback(() => {
    setSelfieOpen(false);
    setNeeds((current) => current.filter((need) => !PHOTO_NEEDS.includes(need)));
    captureMingleClientEvent("mingle_first_message_gate", { step: "face_verified" });
  }, []);

  if (!request) return null;

  const phoneNeeded = needs.includes("phone");
  const photoNeeded = needs.some((need) => PHOTO_NEEDS.includes(need));
  const showPhoneRow = request.needs.includes("phone");
  const showPhotoRow = request.needs.some((need) => PHOTO_NEEDS.includes(need));
  const allDone = needs.length === 0;

  return (
    <div
      data-qa="first-message-gate"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      className="keyboard-safe fixed inset-0 z-[230] flex items-end justify-center bg-black/45"
      onClick={(event) => {
        if (event.target === event.currentTarget) finish(false);
      }}
    >
      <div
        className="relative w-full max-w-[480px] rounded-t-[28px] bg-white px-5 pt-6 shadow-2xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
      >
        <button
          type="button"
          aria-label={copy.close}
          onClick={() => finish(false)}
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-gray-500 active:bg-gray-100"
        >
          <X size={20} strokeWidth={2.2} />
        </button>
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-[#F97316]">
          <ShieldCheck size={26} strokeWidth={2.2} aria-hidden />
        </span>
        <h2 className="mt-4 pr-8 text-[1.25rem] font-extrabold leading-snug text-gray-950">{showPhoneRow && showPhotoRow ? copy.title : copy.titleOne}</h2>
        <p className="mt-2 text-[0.92rem] leading-relaxed text-gray-600">{copy.body}</p>

        <div className="mt-5 space-y-3">
          {showPhoneRow ? (
            <div data-qa="first-message-gate-phone" className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3.5">
              <Smartphone size={22} strokeWidth={2} className="shrink-0 text-gray-700" aria-hidden />
              <span className="min-w-0 flex-1 text-[0.95rem] font-semibold text-gray-900">{copy.phoneRow}</span>
              {phoneNeeded ? (
                <button
                  type="button"
                  data-qa="first-message-gate-phone-action"
                  onClick={() => setPhoneSheetOpen(true)}
                  className="shrink-0 rounded-full bg-gray-950 px-4 py-2 text-[0.85rem] font-bold text-white active:scale-[0.97]"
                >
                  {copy.phoneAction}
                </button>
              ) : (
                <span className="flex shrink-0 items-center gap-1 text-[0.85rem] font-bold text-emerald-600">
                  <Check size={16} strokeWidth={3} aria-hidden />{copy.done}
                </span>
              )}
            </div>
          ) : null}

          {showPhotoRow ? (
            <div data-qa="first-message-gate-photo" className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3.5">
              <ScanFace size={22} strokeWidth={2} className="shrink-0 text-gray-700" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.95rem] font-semibold text-gray-900">{copy.verifyRow}</span>
                {photoNeeded ? <span className="mt-0.5 block text-[0.8rem] leading-snug text-gray-500">{copy.verifyHint}</span> : null}
              </span>
              {photoNeeded ? (
                <button
                  type="button"
                  data-qa="first-message-gate-photo-action"
                  onClick={() => setSelfieOpen(true)}
                  className="shrink-0 rounded-full bg-gray-950 px-4 py-2 text-[0.85rem] font-bold text-white active:scale-[0.97]"
                >
                  {copy.verifyAction}
                </button>
              ) : (
                <span className="flex shrink-0 items-center gap-1 text-[0.85rem] font-bold text-emerald-600">
                  <Check size={16} strokeWidth={3} aria-hidden />{copy.done}
                </span>
              )}
            </div>
          ) : null}
        </div>

        {showPhotoRow ? <p className="mt-3 text-[0.78rem] text-gray-500">{copy.privacyNote}</p> : null}

        <button
          type="button"
          data-qa="first-message-gate-continue"
          disabled={!allDone}
          onClick={() => finish(true)}
          className="mt-5 flex h-14 w-full items-center justify-center rounded-2xl bg-[#F97316] text-[1rem] font-extrabold text-white transition active:scale-[0.985] disabled:bg-gray-200 disabled:text-gray-400"
        >
          {copy.continueLabel}
        </button>
      </div>

      {selfieOpen ? (
        <SelfieVerifyScreen
          locale={locale}
          hasPhoto={!needs.includes("face_photo")}
          onClose={() => setSelfieOpen(false)}
          onVerified={handleFaceVerified}
        />
      ) : null}

      {phoneSheetOpen ? (
        <PhoneVerifySheet
          copy={phoneCopy}
          locale={locale}
          onClose={() => setPhoneSheetOpen(false)}
          onVerified={handlePhoneVerified}
        />
      ) : null}
    </div>
  );
}
