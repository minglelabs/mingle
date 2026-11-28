"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import {
  clearPendingBirthDate,
  clearPendingDiscoverySource,
  clearPendingGender,
  clearPendingInterestLanguages,
  readPendingBirthDate,
  readPendingDiscoverySource,
  readPendingGender,
  readPendingInterestLanguages,
} from "@/components/LivePhoneDemo/live-phone-demo.preferences";
import { buildClientApiPath } from "@/lib/api-contract";
import { clearKoreaVisitAnswer, readKoreaVisitAnswer } from "@/lib/korea-visit";
import {
  clearPendingBio,
  clearPendingHeight,
  clearPendingPhoto,
  clearPhotoRequired,
  dataUrlToFile,
  isPendingPhotoUploadedFor,
  isPhotoRequiredFor,
  markPendingPhotoUploaded,
  markPhotoRequired,
  readPendingBio,
  readPendingFaceSimilarity,
  readPendingHeight,
  readPendingPhoto,
} from "@/lib/pending-profile-extras";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/i18n";

// Loads the face library: only when it is opened, never on the server.
const SelfieVerifyScreen = dynamic(() => import("@/components/selfie-verify-screen"), { ssr: false });

/** Asks PendingProfileSync to run again (answers were given while signed in). */
export const PENDING_PROFILE_SYNC_EVENT = "mingle:pending-profile-sync";

type ProfileSnapshot = {
  gender?: string | null;
  birthDate?: string | null;
  heightCm?: number | null;
  interestLanguages?: unknown;
  imageObjectKey?: string | null;
  bio?: string | null;
  bioDraft?: string | null;
  faceVerified?: boolean;
};

type SendResult = "ok" | "rejected" | "failed";

const RETRY_DELAYS_MS = [1000, 3000];

/**
 * One request, tried up to three times. "rejected": the server said no to
 * what was sent (trying again cannot help). "failed": offline, a timeout or a
 * server error; tried again later.
 */
async function sendWithRetry(send: () => Promise<Response>): Promise<SendResult> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await send().catch(() => null);
    if (response?.ok) return "ok";
    const status = response?.status ?? 0;
    if (status >= 400 && status < 500 && ![401, 408, 429].includes(status)) return "rejected";
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined) return "failed";
    await new Promise((resolve) => window.setTimeout(resolve, delay));
  }
}

/**
 * Saves what the one-pass onboarding (owner, 2026-11-24) collected before the
 * account existed: gender, birth date, height, 관심 언어, the Korea trip,
 * where they heard of us, the self-introduction, and the profile photo with
 * its selfie check. Runs on sign-in on any page, and again when the app comes
 * back to the front or online while something is still waiting; only fills
 * what the profile does not have yet, so a returning account keeps its own.
 *
 * Sign-up needs a face-verified photo. When the server refuses the photo or
 * the check (not a network failure), the account is asked for another photo
 * and a selfie here, on every launch until it passes.
 */
export default function PendingProfileSync() {
  const { status, data } = useSession();
  const userId = (data?.user as { id?: string } | undefined)?.id ?? null;
  const pathname = usePathname();
  const pathLocale = pathname?.split("/")[1] ?? "";
  const locale = isSupportedLocale(pathLocale) ? pathLocale : DEFAULT_LOCALE;
  const runningRef = useRef(false);
  const [photoRequired, setPhotoRequired] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    let cancelled = false;

    const run = async () => {
      if (runningRef.current) return;
      const gender = readPendingGender();
      const birthDate = readPendingBirthDate();
      const heightCm = readPendingHeight();
      const interestLanguages = readPendingInterestLanguages();
      const discoverySource = readPendingDiscoverySource();
      const photo = readPendingPhoto();
      const bio = readPendingBio();
      const koreaVisit = readKoreaVisitAnswer();
      if (!gender && !birthDate && !heightCm && interestLanguages.length === 0 && !discoverySource && !photo && !bio && !koreaVisit) return;
      runningRef.current = true;
      try {
        const response = await fetch(buildClientApiPath("/profile"), { cache: "no-store" });
        if (!response.ok) return;
        const profile = await response.json() as ProfileSnapshot;
        const patch: Record<string, unknown> = {};
        if (gender && !profile.gender) patch.gender = gender;
        if (birthDate && !profile.birthDate) patch.birthDate = birthDate;
        if (heightCm && !profile.heightCm) patch.heightCm = heightCm;
        const hasInterest = Array.isArray(profile.interestLanguages) && profile.interestLanguages.length > 0;
        if (interestLanguages.length > 0 && !hasInterest) patch.interestLanguages = interestLanguages;
        if (bio && !profile.bioDraft?.trim() && !profile.bio?.trim()) patch.bio = bio.slice(0, 160);
        if (Object.keys(patch).length > 0) {
          const saved = await fetch(buildClientApiPath("/profile"), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
          if (!saved.ok) return;
        }
        clearPendingGender();
        clearPendingBirthDate();
        clearPendingHeight();
        clearPendingInterestLanguages();
        clearPendingBio();

        // Each of these in its own request, so a refused value never blocks the rest.
        if (discoverySource) {
          const saved = await fetch(buildClientApiPath("/profile"), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ discoverySource }),
          }).catch(() => null);
          if (saved?.ok) clearPendingDiscoverySource();
        }
        // The Korea trip (owner, 2026-11-25): on the profile, not only on the phone.
        if (koreaVisit) {
          const saved = await sendWithRetry(() => fetch(buildClientApiPath("/profile"), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ koreaVisit }),
          }));
          if (saved !== "failed") clearKoreaVisitAnswer();
        }

        // The photo picked during onboarding wins over a sign-in provider's
        // picture, never over one this account uploaded itself.
        if (photo) {
          const uploadedHere = isPendingPhotoUploadedFor(userId);
          if (profile.imageObjectKey && !uploadedHere) {
            clearPendingPhoto();
            return;
          }
          // Women sign up with a photo alone (owner, 2026-11-25).
          const selfieAsked = (gender ?? profile.gender) !== "female";
          const askForAnother = () => {
            clearPendingPhoto();
            if (!selfieAsked) return;
            markPhotoRequired(userId);
            if (!cancelled) setPhotoRequired(true);
          };
          if (!uploadedHere) {
            const file = await dataUrlToFile(photo, "profile.jpg");
            const uploaded = await sendWithRetry(() => {
              const form = new FormData();
              form.append("file", file);
              return fetch(buildClientApiPath("/profile/image"), { method: "POST", body: form });
            });
            if (uploaded === "rejected") return askForAnother();
            // Still on the phone: sent again when the app comes back.
            if (uploaded === "failed") return;
            markPendingPhotoUploaded(userId);
          }
          // The selfie check passed against this photo during onboarding.
          const similarity = readPendingFaceSimilarity();
          if (similarity === null) {
            if (!selfieAsked) {
              clearPendingPhoto();
              return;
            }
            return askForAnother();
          }
          const verified = await sendWithRetry(() => fetch(buildClientApiPath("/profile/face-verification"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ similarity }),
          }));
          if (verified === "rejected") return askForAnother();
          if (verified === "failed") return;
          clearPendingPhoto();
        }
      } catch {
        // Offline: tried again when the app comes back.
      } finally {
        runningRef.current = false;
      }
    };

    const timer = window.setTimeout(() => {
      if (isPhotoRequiredFor(userId)) setPhotoRequired(true);
    }, 0);
    void run();
    const again = () => {
      if (document.visibilityState === "visible") void run();
    };
    window.addEventListener(PENDING_PROFILE_SYNC_EVENT, again);
    window.addEventListener("online", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener(PENDING_PROFILE_SYNC_EVENT, again);
      window.removeEventListener("online", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [status, userId]);

  if (!photoRequired || status !== "authenticated") return null;
  return (
    <SelfieVerifyScreen
      locale={locale}
      hasPhoto={false}
      onVerified={() => {
        clearPhotoRequired();
        setPhotoRequired(false);
      }}
      // Closed for now (no camera here): asked again on the next launch.
      onClose={() => setPhotoRequired(false)}
    />
  );
}
