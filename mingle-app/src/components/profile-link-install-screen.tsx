"use client";

import {
  Apple,
  ArrowUpRight,
  CheckCircle2,
  Download,
  Play,
  Smartphone,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  buildProfileAppUrl,
  isValidProfileLinkUserId,
} from "@/lib/profile-link";

type ProfileLinkInstallScreenProps = {
  userId: string;
  iosAppStoreUrl: string;
  androidPlayStoreUrl: string;
};

function getCopy(isKorean: boolean) {
  return {
    title: isKorean ? "Mingle에서 프로필을 열어보세요" : "Open this profile in Mingle",
    description: isKorean
      ? "프로필 공유 링크는 Mingle 앱에서만 열 수 있습니다. 앱을 설치한 뒤 다시 열어주세요."
      : "Profile sharing links open in the Mingle app. Install the app, then open this link again.",
    openInApp: isKorean ? "앱에서 열기" : "Open in app",
    openHint: isKorean
      ? "앱이 이미 설치되어 있다면 바로 프로필로 이동합니다."
      : "If Mingle is installed, this opens the profile directly.",
    downloadTitle: isKorean ? "Mingle 설치하기" : "Install Mingle",
    downloadDescription: isKorean
      ? "아래 스토어에서 앱을 설치할 수 있습니다."
      : "Choose your app store to install Mingle.",
    appStore: isKorean ? "App Store에서 받기" : "Download on the App Store",
    playStore: isKorean ? "Google Play에서 받기" : "Get it on Google Play",
    invalidTitle: isKorean ? "잘못된 프로필 링크입니다" : "This profile link is invalid",
    invalidDescription: isKorean
      ? "QR 코드가 손상되었거나 더 이상 사용할 수 없는 링크입니다."
      : "The QR code may be damaged or the link is no longer available.",
    verified: isKorean ? "Mingle 프로필 링크 확인됨" : "Verified Mingle profile link",
  };
}

export default function ProfileLinkInstallScreen({
  userId,
  iosAppStoreUrl,
  androidPlayStoreUrl,
}: ProfileLinkInstallScreenProps) {
  const [openAttempted, setOpenAttempted] = useState(false);
  const isKorean = useMemo(
    () => typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ko"),
    [],
  );
  const copy = getCopy(isKorean);
  const isValid = isValidProfileLinkUserId(userId);
  const appUrl = isValid ? buildProfileAppUrl(userId) : null;
  const isAndroid = useMemo(
    () => typeof navigator !== "undefined" && /android/i.test(navigator.userAgent),
    [],
  );
  const isIos = useMemo(
    () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent),
    [],
  );

  const handleOpenInApp = () => {
    if (!appUrl) return;
    setOpenAttempted(true);
    window.location.href = appUrl;
  };

  if (!isValid) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f3ee] px-6 py-12 text-slate-950">
        <section className="w-full max-w-md rounded-[2rem] bg-white p-8 text-center shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-500">
            <Smartphone className="h-8 w-8" aria-hidden="true" />
          </div>
          <h1 className="mt-6 text-2xl font-bold tracking-tight">{copy.invalidTitle}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">{copy.invalidDescription}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(145deg,#1295e8_0%,#3569ed_52%,#7338f2_100%)] px-5 py-10 text-slate-950">
      <section className="w-full max-w-md rounded-[2rem] bg-white/95 p-7 shadow-[0_24px_70px_rgba(22,50,140,0.28)] backdrop-blur">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-[#f3c35a] text-3xl font-black text-slate-950 shadow-sm">
          M
        </div>
        <div className="mt-5 flex items-center justify-center gap-2 text-xs font-semibold text-emerald-600">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <span>{copy.verified}</span>
        </div>
        <h1 className="mt-4 text-center text-2xl font-bold tracking-tight">{copy.title}</h1>
        <p className="mt-3 text-center text-sm leading-6 text-slate-500">{copy.description}</p>

        <button
          type="button"
          onClick={handleOpenInApp}
          className="mt-7 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 text-base font-semibold text-white transition active:scale-[0.99]"
        >
          <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
          {copy.openInApp}
        </button>
        <p className="mt-2 text-center text-xs text-slate-400">{copy.openHint}</p>

        <div className="my-7 flex items-center gap-3 text-xs text-slate-300">
          <span className="h-px flex-1 bg-slate-200" />
          <span>{copy.downloadTitle}</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>
        <p className="mb-4 text-center text-sm text-slate-500">{copy.downloadDescription}</p>
        <div className="grid gap-3">
          {iosAppStoreUrl && (!isAndroid || isIos) ? (
            <a
              href={iosAppStoreUrl}
              className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 py-3.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              rel="noreferrer"
            >
              <Apple className="h-5 w-5" aria-hidden="true" />
              {copy.appStore}
            </a>
          ) : null}
          {androidPlayStoreUrl && (!isIos || isAndroid) ? (
            <a
              href={androidPlayStoreUrl}
              className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 py-3.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              rel="noreferrer"
            >
              <Play className="h-5 w-5 fill-current" aria-hidden="true" />
              {copy.playStore}
            </a>
          ) : null}
        </div>
        {openAttempted ? (
          <p className="mt-5 flex items-center justify-center gap-2 text-xs text-amber-600">
            <Download className="h-4 w-4" aria-hidden="true" />
            {isKorean ? "앱이 열리지 않으면 아래 스토어에서 설치해 주세요." : "If the app did not open, install it from a store below."}
          </p>
        ) : null}
      </section>
    </main>
  );
}
