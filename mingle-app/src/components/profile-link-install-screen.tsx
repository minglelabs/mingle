"use client";

import {
  Play,
  Smartphone,
} from "lucide-react";
import { useMemo, useRef, type MouseEvent } from "react";
import {
  buildProfileAppUrl,
  isValidProfileLinkUserId,
  PROFILE_APP_SCHEME,
} from "@/lib/profile-link";
import { buildProfileImageTransform } from "@/lib/profile-image-crop";
import { formatHandle } from "@/lib/handles";
import {
  getProfileLinkInstallCopy,
  type ProfileLinkInstallLocale,
} from "@/components/profile-link-install-copy";

export type ProfileLinkInstallProfile = {
  name: string | null;
  handle: string | null;
  image: string | null;
  imageCropScale: number | null;
  imageCropX: number | null;
  imageCropY: number | null;
};

type ProfileLinkInstallScreenProps = {
  userId: string;
  iosAppStoreUrl: string;
  androidPlayStoreUrl: string;
  locale: ProfileLinkInstallLocale;
  profile: ProfileLinkInstallProfile | null;
};

function AppleLogo() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M15.464 3.784c.8-.96 1.336-2.296 1.188-3.624-1.152.048-2.544.768-3.376 1.728-.736.848-1.384 2.2-1.208 3.496 1.288.1 2.6-.648 3.396-1.6ZM20.88 17.028c-.036-.016-3.1-1.188-3.132-4.716-.028-2.948 2.408-4.356 2.52-4.42-1.392-2.036-3.564-2.264-4.328-2.296-1.8-.144-3.512 1.072-4.428 1.072-.948 0-2.415-1.078-3.96-1.047-2.04.032-3.92 1.176-4.968 3.008-2.136 3.704-.544 9.136 1.512 12.128 1 1.464 2.168 3.104 3.72 3.048 1.48-.064 2.04-.968 3.832-.968 1.768 0 2.272.968 3.84.936 1.6-.032 2.608-1.464 3.576-2.936 1.128-1.648 1.592-3.248 1.616-3.328-.036-.016-.764-.292-1.8-.481Z" />
    </svg>
  );
}

export default function ProfileLinkInstallScreen({
  userId,
  iosAppStoreUrl,
  androidPlayStoreUrl,
  locale,
  profile,
}: ProfileLinkInstallScreenProps) {
  const copy = getProfileLinkInstallCopy(locale);
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
  const launchNonceRef = useRef(0);
  const profileName = profile?.name?.trim() || copy.userFallback;
  const profileHandle = formatHandle(profile?.handle);

  const handleOpenInApp = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!appUrl) {
      event.preventDefault();
      return;
    }

    launchNonceRef.current += 1;
    const launchNonce = String(Date.now()) + "-" + String(launchNonceRef.current);
    const launchUrl = buildProfileAppUrl(userId, launchNonce, PROFILE_APP_SCHEME) ?? appUrl;

    // Keep this as a real anchor navigation. Chrome treats the browser's
    // default action as the user's activation, which is more reliable for
    // repeatedly opening a custom URL scheme than window.location.assign().
    // Updating href in the click handler also gives every attempt a fresh URL
    // without losing the browser gesture.
    event.currentTarget.href = launchUrl;
    console.info("[MingleProfileLink] browser_open", {
      attempt: launchNonceRef.current,
      scheme: PROFILE_APP_SCHEME,
      hasNonce: true,
      nonceHint: launchNonce.slice(-8),
    });
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
        {profile ? (
          <div className="mx-auto flex max-w-[18rem] items-center justify-center gap-3.5">
            <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-sm">
              {profile.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.image}
                  alt={profileName}
                  width={72}
                  height={72}
                  className="h-full w-full object-cover"
                  style={{
                    transform: buildProfileImageTransform(72, {
                      scale: profile.imageCropScale,
                      x: profile.imageCropX,
                      y: profile.imageCropY,
                    }),
                  }}
                />
              ) : (
                <span className="text-2xl font-bold text-slate-400" aria-hidden="true">M</span>
              )}
            </div>
            <div className="min-w-0 text-left">
              <p className="truncate text-lg font-bold tracking-tight text-slate-950">{profileName}</p>
              {profileHandle ? (
                <p className="mt-0.5 truncate text-sm font-medium text-slate-500">{profileHandle}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-[#F3C35A] shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mingle-icon.png" alt="" className="h-full w-full rounded-[1.4rem]" aria-hidden="true" />
          </div>
        )}
        <h1 className="mt-6 text-center text-2xl font-bold tracking-tight">{copy.title}</h1>

        <a
          href={appUrl ?? "#"}
          onClick={handleOpenInApp}
          className="mt-7 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F3C35A] px-5 py-4 text-base font-semibold text-[#2D2A1E] shadow-[0_10px_24px_rgba(243,195,90,0.28)] transition hover:bg-[#EAB54A] active:scale-[0.99]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mingle-icon.png" alt="" className="h-5 w-5 rounded-[5px]" aria-hidden="true" />
          {copy.openInApp}
        </a>

        <div className="mt-5 grid gap-3">
          {iosAppStoreUrl && (!isAndroid || isIos) ? (
            <a
              href={iosAppStoreUrl}
              className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 py-3.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              rel="noreferrer"
            >
              <AppleLogo />
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
      </section>
    </main>
  );
}
