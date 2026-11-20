"use client";

import { Camera, Check, Loader2, ShieldCheck, Smartphone, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import PhoneVerifySheet from "@/components/contacts/phone-verify-sheet";
import { resolveFirstMessageGateCopy } from "@/i18n/first-message-gate-copy";
import { resolvePhoneFriendsCopy } from "@/i18n/phone-friends-copy";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/i18n";
import { buildClientApiPath } from "@/lib/api-contract";
import { registerFirstMessageSetupHandler, type FirstMessageNeed } from "@/lib/first-message-setup";
import { checkPhotoForFace, type FaceCheckResult } from "@/lib/native-face-check";
import { captureMingleClientEvent } from "@/lib/posthog-client";
import { useNativeBannerSuppression } from "@/lib/use-native-banner-suppression";

type PendingRequest = { needs: FirstMessageNeed[]; resolve: (ok: boolean) => void };
type PhotoState = "idle" | "checking" | "uploading" | "no_face" | "failed";

async function postFaceCheck(result: FaceCheckResult): Promise<void> {
  try {
    await fetch(buildClientApiPath("/profile/image/face-check"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result }),
    });
  } catch {
    // The server asks again next time.
  }
}

/** Checks the photo the account already has (never checked before) on the phone. */
async function checkCurrentPhoto(): Promise<FaceCheckResult | null> {
  try {
    const response = await fetch(buildClientApiPath("/profile/image/face-check"), { cache: "no-store" });
    if (!response.ok) return null;
    return await checkPhotoForFace(await response.blob());
  } catch {
    return null;
  }
}

/**
 * The sheet shown when a first room with someone new is refused with
 * `first_message_setup` (see @/lib/first-message-setup): verify the phone
 * number, and have a profile photo with a face in it, checked on the phone.
 */
export default function FirstMessageGate() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const userId = typeof session?.user?.id === "string" ? session.user.id : "";
  const pathLocale = pathname?.split("/")[1] ?? "";
  const locale = isSupportedLocale(pathLocale) ? pathLocale : DEFAULT_LOCALE;
  const copy = useMemo(() => resolveFirstMessageGateCopy(locale), [locale]);
  const phoneCopy = useMemo(() => resolvePhoneFriendsCopy(locale), [locale]);

  const [request, setRequest] = useState<PendingRequest | null>(null);
  const requestRef = useRef<PendingRequest | null>(null);
  const [needs, setNeeds] = useState<FirstMessageNeed[]>([]);
  const [photoState, setPhotoState] = useState<PhotoState>("idle");
  const [phoneSheetOpen, setPhoneSheetOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
    setPhotoState("idle");
    captureMingleClientEvent("mingle_first_message_gate", { step: "shown", needs: nextNeeds.join(",") });
  })), []);

  // A photo that was never checked: check it on the phone before asking for a new one.
  const needsCurrentCheck = request !== null && needs.includes("face_check");
  useEffect(() => {
    if (!needsCurrentCheck) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setPhotoState("checking");
      void checkCurrentPhoto().then(async (result) => {
        if (cancelled) return;
        if (result === "face" || result === "unchecked") {
          await postFaceCheck(result);
          setNeeds((current) => current.filter((need) => need !== "face_check"));
          setPhotoState("idle");
          return;
        }
        if (result === "no_face") await postFaceCheck("no_face");
        // No face, or the photo could not be read: ask for a photo.
        setNeeds((current) => [...current.filter((need) => need !== "face_check" && need !== "face_photo"), "face_photo"]);
        setPhotoState(result === "no_face" ? "no_face" : "idle");
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [needsCurrentCheck]);

  const finish = useCallback((ok: boolean) => {
    const current = requestRef.current;
    requestRef.current = null;
    current?.resolve(ok);
    setRequest(null);
    setPhoneSheetOpen(false);
    captureMingleClientEvent("mingle_first_message_gate", { step: ok ? "completed" : "closed" });
  }, []);

  const handlePhoneVerified = useCallback(() => {
    setPhoneSheetOpen(false);
    setNeeds((current) => current.filter((need) => need !== "phone"));
  }, []);

  const handlePhotoPicked = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhotoState("checking");
    const result = await checkPhotoForFace(file);
    if (result === "no_face") {
      setPhotoState("no_face");
      return;
    }
    setPhotoState("uploading");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("imageCropScale", "1");
      form.append("imageCropX", "0");
      form.append("imageCropY", "0");
      form.append("faceCheck", result);
      const response = await fetch(buildClientApiPath("/profile/image"), {
        method: "POST",
        headers: userId ? { "x-mingle-expected-account-id": userId } : undefined,
        body: form,
      });
      if (!response.ok) throw new Error("profile_image_failed");
      setNeeds((current) => current.filter((need) => need !== "face_photo" && need !== "face_check"));
      setPhotoState("idle");
    } catch {
      setPhotoState("failed");
    }
  }, [userId]);

  if (!request) return null;

  const phoneNeeded = needs.includes("phone");
  const photoNeeded = needs.includes("face_photo") || needs.includes("face_check");
  const showPhoneRow = request.needs.includes("phone");
  const showPhotoRow = request.needs.includes("face_photo") || request.needs.includes("face_check");
  const photoBusy = photoState === "checking" || photoState === "uploading";
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
        <h2 className="mt-4 pr-8 text-[1.25rem] font-extrabold leading-snug text-gray-950">{copy.title}</h2>
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
            <div data-qa="first-message-gate-photo" className="rounded-2xl border border-gray-200 px-4 py-3.5">
              <div className="flex items-center gap-3">
                <Camera size={22} strokeWidth={2} className="shrink-0 text-gray-700" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.95rem] font-semibold text-gray-900">{copy.photoRow}</span>
                  {photoNeeded && !photoBusy ? (
                    <span className="mt-0.5 block text-[0.8rem] text-gray-500">{copy.photoHint}</span>
                  ) : null}
                </span>
                {photoBusy ? (
                  <Loader2 size={20} strokeWidth={2.4} className="shrink-0 animate-spin text-gray-500" aria-label={copy.photoChecking} />
                ) : photoNeeded ? (
                  <button
                    type="button"
                    data-qa="first-message-gate-photo-action"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={needs.includes("face_check")}
                    className="shrink-0 rounded-full bg-gray-950 px-4 py-2 text-[0.85rem] font-bold text-white active:scale-[0.97] disabled:opacity-40"
                  >
                    {copy.photoAction}
                  </button>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 text-[0.85rem] font-bold text-emerald-600">
                    <Check size={16} strokeWidth={3} aria-hidden />{copy.done}
                  </span>
                )}
              </div>
              {photoState === "checking" ? (
                <p className="mt-2 text-[0.8rem] text-gray-500">{copy.photoChecking}</p>
              ) : photoState === "no_face" ? (
                <p data-qa="first-message-gate-no-face" className="mt-2 text-[0.82rem] font-medium text-rose-600">{copy.photoNoFace}</p>
              ) : photoState === "failed" ? (
                <p className="mt-2 text-[0.82rem] font-medium text-rose-600">{copy.photoFailed}</p>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => void handlePhotoPicked(event)}
              />
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
