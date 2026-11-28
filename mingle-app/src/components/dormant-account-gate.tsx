"use client";

import dynamic from "next/dynamic";
import { Loader2, Moon } from "lucide-react";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/i18n";
import { resolveDormantAccountCopy } from "@/i18n/dormant-account-copy";
import { resolveFirstMessageGateCopy } from "@/i18n/first-message-gate-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { uploadProfilePhotoWithFaceCheck } from "@/lib/profile-photo-upload";
import { useNativeBannerSuppression } from "@/lib/use-native-banner-suppression";

// Loads the face library: only when it is opened, never on the server.
const SelfieVerifyScreen = dynamic(() => import("@/components/selfie-verify-screen"), { ssr: false });

type DormantProfile = { dormant: boolean; female: boolean; hasPhoto: boolean };

async function readDormantProfile(): Promise<DormantProfile | null> {
  const response = await fetch(buildClientApiPath("/profile"), { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return null;
  const profile = await response.json().catch(() => null) as { dormant?: unknown; gender?: unknown; image?: unknown } | null;
  if (!profile) return null;
  return {
    dormant: profile.dormant === true,
    female: profile.gender === "female",
    hasPhoto: typeof profile.image === "string" && profile.image.trim().length > 0,
  };
}

/**
 * A dormant account (owner, 2026-11-25; src/server/dormancy.ts) sees only
 * this screen, on every page, until it adds a profile photo with a face and
 * passes the selfie check (women: the photo alone). The server wakes the
 * account; this screen then goes away.
 */
export default function DormantAccountGate() {
  const { status, data } = useSession();
  const userId = (data?.user as { id?: string } | undefined)?.id ?? null;
  const pathname = usePathname();
  const pathLocale = pathname?.split("/")[1] ?? "";
  const locale = isSupportedLocale(pathLocale) ? pathLocale : DEFAULT_LOCALE;
  const isAdminPath = pathname?.startsWith("/admin") === true;
  const copy = useMemo(() => resolveDormantAccountCopy(locale), [locale]);
  const photoCopy = useMemo(() => resolveFirstMessageGateCopy(locale), [locale]);
  const [profile, setProfile] = useState<DormantProfile | null>(null);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [photoState, setPhotoState] = useState<"idle" | "busy" | "no_face" | "failed">("idle");
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    const next = await readDormantProfile();
    // Offline: what is on screen stays.
    if (!next) return null;
    setProfile(next);
    return next;
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !userId || isAdminPath) return;
    let cancelled = false;
    void readDormantProfile().then((next) => {
      if (!cancelled && next) setProfile(next);
    });
    return () => { cancelled = true; };
  }, [isAdminPath, status, userId]);

  // The app's ad banner draws above the page: none over the dormant screen.
  useNativeBannerSuppression(status === "authenticated" && !isAdminPath && profile?.dormant === true);

  const afterStep = useCallback(async () => {
    const next = await refresh();
    if (next && !next.dormant) {
      setSelfieOpen(false);
      toast(copy.released);
    }
  }, [copy.released, refresh]);

  const handlePhotoPicked = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhotoState("busy");
    const result = await uploadProfilePhotoWithFaceCheck(file, userId);
    if (result.status !== "uploaded") {
      setPhotoState(result.status);
      return;
    }
    setPhotoState("idle");
    await afterStep();
  }, [afterStep, userId]);

  if (status !== "authenticated" || isAdminPath || !profile?.dormant) return null;

  if (selfieOpen) {
    return (
      <SelfieVerifyScreen
        locale={locale}
        hasPhoto={profile.hasPhoto}
        onPhotoUploaded={() => setProfile((current) => (current ? { ...current, hasPhoto: true } : current))}
        onVerified={() => void afterStep()}
        // Back to the dormant screen: the account stays asleep.
        onClose={() => setSelfieOpen(false)}
      />
    );
  }

  const notice = photoState === "no_face" ? photoCopy.photoNoFace : photoState === "failed" ? photoCopy.photoFailed : null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dormant-account-title"
      data-qa="dormant-account-screen"
      className="fixed inset-0 z-[230] flex flex-col items-center justify-center bg-white px-7 text-center text-gray-950"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-50 text-amber-500" aria-hidden="true">
        <Moon size={38} strokeWidth={2} />
      </span>
      <h1 id="dormant-account-title" className="mt-6 text-[24px] font-bold leading-tight">{copy.title}</h1>
      <p className="mt-3 text-[15.5px] leading-relaxed text-slate-600">{profile.female ? copy.bodyPhotoOnly : copy.body}</p>
      {notice ? <p role="alert" className="mt-4 text-[14px] font-semibold leading-snug text-rose-600">{notice}</p> : null}
      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void handlePhotoPicked(event)} />
      <button
        type="button"
        data-qa="dormant-account-wake"
        disabled={photoState === "busy"}
        onClick={() => (profile.female ? photoInputRef.current?.click() : setSelfieOpen(true))}
        className="mt-8 flex h-14 w-full max-w-[340px] items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-[16px] font-bold text-white transition active:scale-[0.985] disabled:opacity-60"
      >
        {photoState === "busy" ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : null}
        {photoState === "busy" ? photoCopy.photoChecking : profile.female ? copy.actionPhotoOnly : copy.action}
      </button>
      <button
        type="button"
        data-qa="dormant-account-sign-out"
        onClick={() => void signOut({ callbackUrl: `/${locale}` })}
        className="mt-4 h-11 px-4 text-[14px] font-semibold text-slate-500 underline-offset-4 active:underline"
      >
        {copy.signOut}
      </button>
    </div>
  );
}
