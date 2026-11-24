"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
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
import {
  clearPendingHeight,
  clearPendingPhoto,
  dataUrlToFile,
  readPendingFaceSimilarity,
  readPendingHeight,
  readPendingPhoto,
} from "@/lib/pending-profile-extras";

type ProfileSnapshot = {
  gender?: string | null;
  birthDate?: string | null;
  heightCm?: number | null;
  interestLanguages?: unknown;
  imageObjectKey?: string | null;
};

/**
 * Saves what the one-pass onboarding (owner, 2026-11-24) collected before the
 * account existed: gender, birth date, height, 관심 언어, where they heard of
 * us, and the profile photo. Runs once per sign-in on any page; only fills
 * what the profile does not have yet, so a returning account keeps its own.
 */
export default function PendingProfileSync() {
  const { status, data } = useSession();
  const userId = (data?.user as { id?: string } | undefined)?.id ?? null;
  const doneFor = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !userId || doneFor.current === userId) return;
    const gender = readPendingGender();
    const birthDate = readPendingBirthDate();
    const heightCm = readPendingHeight();
    const interestLanguages = readPendingInterestLanguages();
    const discoverySource = readPendingDiscoverySource();
    const photo = readPendingPhoto();
    if (!gender && !birthDate && !heightCm && interestLanguages.length === 0 && !discoverySource && !photo) return;
    doneFor.current = userId;

    void (async () => {
      try {
        const response = await fetch(buildClientApiPath("/profile"), { cache: "no-store" });
        if (!response.ok) {
          doneFor.current = null;
          return;
        }
        const profile = await response.json() as ProfileSnapshot;
        const patch: Record<string, unknown> = {};
        if (gender && !profile.gender) patch.gender = gender;
        if (birthDate && !profile.birthDate) patch.birthDate = birthDate;
        if (heightCm && !profile.heightCm) patch.heightCm = heightCm;
        const hasInterest = Array.isArray(profile.interestLanguages) && profile.interestLanguages.length > 0;
        if (interestLanguages.length > 0 && !hasInterest) patch.interestLanguages = interestLanguages;
        if (Object.keys(patch).length > 0) {
          const saved = await fetch(buildClientApiPath("/profile"), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
          if (!saved.ok) {
            doneFor.current = null;
            return;
          }
        }
        clearPendingGender();
        clearPendingBirthDate();
        clearPendingHeight();
        clearPendingInterestLanguages();

        // Asked once; its own request so a refused value never blocks the rest.
        if (discoverySource) {
          const saved = await fetch(buildClientApiPath("/profile"), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ discoverySource }),
          }).catch(() => null);
          if (saved?.ok) clearPendingDiscoverySource();
        }

        // The photo picked during onboarding wins over a sign-in provider's
        // picture, never over one this account uploaded itself.
        if (photo) {
          if (profile.imageObjectKey) {
            clearPendingPhoto();
            return;
          }
          const form = new FormData();
          form.append("file", await dataUrlToFile(photo, "profile.jpg"));
          const uploaded = await fetch(buildClientApiPath("/profile/image"), { method: "POST", body: form }).catch(() => null);
          if (!uploaded?.ok) return;
          // The selfie check passed against this photo during onboarding.
          const similarity = readPendingFaceSimilarity();
          if (similarity !== null) {
            await fetch(buildClientApiPath("/profile/face-verification"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ similarity }),
            }).catch(() => null);
          }
          clearPendingPhoto();
        }
      } catch {
        // Offline: tried again on the next page load.
        doneFor.current = null;
      }
    })();
  }, [status, userId]);

  return null;
}
