"use client";

import ProfileBio from "./profile-bio";
import { buildProfileImageTransform, type ProfileImageCropInput } from "@/lib/profile-image-crop";
import {
  postNativeAndroidBackCapability,
  registerNativeBackHandler,
} from "@/lib/native-back-handler";
import LanguageFlag from "@/components/language-flag";
import AccountBadge from "@/components/posts/account-badge";
import type { AccountBadgeKind } from "@/lib/account-badge";
import { X, UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import FlagEmoji from "@/components/flag-emoji";
import { countryFlagEmoji, getCountryDisplayName, normalizeNationalityCountry } from "@/lib/nationality";
import { resolveOnboardingExtraCopy } from "@/i18n/onboarding-extra-copy";

type ProfileImagePreviewProps = {
  open: boolean;
  image: string | null;
  alt: string;
  crop?: ProfileImageCropInput;
  /** 국적: shown first under the name (owner, 2026-11-25), before the language. */
  country?: string | null;
  language?: string | null;
  flag?: string | null;
  languageName?: string | null;
  languageLabel?: string | null;
  name?: string | null;
  /** Badge next to the name (`resolveAccountBadge(profile)`) when it is another user's. */
  nameBadge?: AccountBadgeKind | null;
  handle?: string | null;
  bio?: string | null;
  bioUserId?: string;
  locale?: string;
  closeLabel: string;
  onClose: () => void;
};

const PREVIEW_MAX_SIZE = 420;
const MAX_ZOOM = 4;

type Zoom = { scale: number; x: number; y: number };
const NO_ZOOM: Zoom = { scale: 1, x: 0, y: 0 };

/** Keeps the zoomed photo covering its circle: no pan past the edges. */
function clampZoom(zoom: Zoom, size: number): Zoom {
  const scale = Math.min(MAX_ZOOM, Math.max(1, zoom.scale));
  const limit = (size * (scale - 1)) / 2;
  return { scale, x: Math.max(-limit, Math.min(limit, zoom.x)), y: Math.max(-limit, Math.min(limit, zoom.y)) };
}

export default function ProfileImagePreview({
  open,
  image,
  alt,
  crop,
  country,
  language,
  flag,
  languageName,
  languageLabel,
  name,
  nameBadge = null,
  handle,
  bio,
  bioUserId,
  locale = "en",
  closeLabel,
  onClose,
}: ProfileImagePreviewProps) {
  const [previewSize, setPreviewSize] = useState(320);
  // Two fingers zoom the photo (up to MAX_ZOOM), one finger pans it while
  // zoomed, a double tap goes in or back out (owner, 2026-11-25).
  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM);
  const gestureRef = useRef<{
    startDistance: number;
    startZoom: Zoom;
    startMid: { x: number; y: number };
    lastTapAt: number;
  }>({ startDistance: 0, startZoom: NO_ZOOM, startMid: { x: 0, y: 0 }, lastTapAt: 0 });
  // Closing drops the zoom, so the next opening starts whole.
  const close = useCallback(() => {
    setZoom(NO_ZOOM);
    onClose();
  }, [onClose]);
  const handleZoomStart = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    const touches = event.touches;
    if (touches.length === 2) {
      gesture.startDistance = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
      gesture.startMid = { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 };
      gesture.startZoom = zoom;
    } else if (touches.length === 1) {
      gesture.startDistance = 0;
      gesture.startMid = { x: touches[0].clientX, y: touches[0].clientY };
      gesture.startZoom = zoom;
      const now = Date.now();
      if (now - gesture.lastTapAt < 280) {
        setZoom(zoom.scale > 1 ? NO_ZOOM : { scale: 2, x: 0, y: 0 });
        gesture.lastTapAt = 0;
      } else {
        gesture.lastTapAt = now;
      }
    }
  }, [zoom]);
  const handleZoomMove = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    const touches = event.touches;
    if (touches.length === 2 && gesture.startDistance > 0) {
      const distance = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
      const mid = { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 };
      const scale = gesture.startZoom.scale * (distance / gesture.startDistance);
      setZoom(clampZoom({
        scale,
        x: gesture.startZoom.x + (mid.x - gesture.startMid.x),
        y: gesture.startZoom.y + (mid.y - gesture.startMid.y),
      }, previewSize));
    } else if (touches.length === 1 && gesture.startZoom.scale > 1) {
      setZoom(clampZoom({
        scale: gesture.startZoom.scale,
        x: gesture.startZoom.x + (touches[0].clientX - gesture.startMid.x),
        y: gesture.startZoom.y + (touches[0].clientY - gesture.startMid.y),
      }, previewSize));
    }
  }, [previewSize]);
  const handleZoomEnd = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    // One finger left of a pinch: go on panning from here.
    const gesture = gestureRef.current;
    if (event.touches.length === 1) {
      gesture.startDistance = 0;
      gesture.startMid = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      gesture.startZoom = zoom;
    }
  }, [zoom]);
  const countryCode = normalizeNationalityCountry(country);
  const countryName = countryCode ? getCountryDisplayName(countryCode, locale) : null;

  useEffect(() => {
    if (!open) return;

    const syncPreviewSize = () => {
      setPreviewSize(Math.max(180, Math.min(PREVIEW_MAX_SIZE, window.innerWidth * 0.8)));
    };
    syncPreviewSize();
    window.addEventListener("resize", syncPreviewSize);

    return () => window.removeEventListener("resize", syncPreviewSize);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [close, open]);

  useEffect(() => {
    if (!open) return;

    postNativeAndroidBackCapability(true);
    return () => postNativeAndroidBackCapability(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    return registerNativeBackHandler(() => {
      close();
      return true;
    }, 80);
  }, [close, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-black/80 px-5 py-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),24px)]"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onPointerDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <button
        type="button"
        onClick={close}
        className="absolute right-4 top-[max(env(safe-area-inset-top),16px)] flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 active:bg-white/30"
        aria-label={closeLabel}
      >
        <X size={24} strokeWidth={2.1} aria-hidden="true" />
      </button>

      <div className="flex max-h-[85dvh] max-w-full flex-col items-center overflow-y-auto overscroll-contain">
        <div
          data-qa="profile-image-preview-photo"
          className="shrink-0 overflow-hidden rounded-full border border-white/20 bg-white/10 shadow-[0_24px_70px_rgba(0,0,0,0.45)]"
          style={{ height: previewSize, width: previewSize, touchAction: "none" }}
          onTouchStart={image ? handleZoomStart : undefined}
          onTouchMove={image ? handleZoomMove : undefined}
          onTouchEnd={image ? handleZoomEnd : undefined}
        >
          {image ? (
            <div
              className="h-full w-full"
              style={{
                transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
                transition: zoom.scale === 1 && zoom.x === 0 && zoom.y === 0 ? "transform 160ms ease-out" : undefined,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image}
                alt={alt}
                width={previewSize}
                height={previewSize}
                draggable={false}
                className="h-full w-full select-none object-cover"
                style={{ transform: buildProfileImageTransform(previewSize, crop) }}
              />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <UserRound size={Math.round(previewSize * 0.42)} className="text-white/55" aria-hidden="true" />
            </div>
          )}
        </div>

        {(name?.trim() || handle?.trim() || bio?.trim() || countryCode || language || flag || languageName) ? (
          <div className="mt-5 w-full max-w-[min(20rem,85vw)] rounded-[24px] border border-white/15 bg-white/12 px-5 py-4 text-white shadow-[0_12px_36px_rgba(0,0,0,0.18)] backdrop-blur-md">
            {name?.trim() ? (
              <p className="flex min-w-0 items-center justify-center gap-1.5 text-center text-[19px] font-semibold tracking-[-0.01em]">
                <span className="truncate">{name.trim()}</span>
                <AccountBadge kind={nameBadge} locale={locale} tone="light" />
              </p>
            ) : null}
            {handle?.trim() ? <p className="mt-0.5 truncate text-center text-[13px] text-white/65">@{handle.trim().replace(/^@+/, "")}</p> : null}
            {countryCode ? (
              <div data-qa="profile-image-preview-country" className="mt-3 flex items-center justify-center gap-2">
                <span className="text-[1.35rem] leading-none" aria-hidden="true">{countryFlagEmoji(countryCode)}</span>
                <span className="flex flex-col items-start">
                  <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/55">{resolveOnboardingExtraCopy(locale).nationalityLabel}</span>
                  <span className="text-[14px] font-semibold">{countryName}</span>
                </span>
              </div>
            ) : null}
            {bioUserId ? <ProfileBio userId={bioUserId} initialBio={bio} locale={locale} dark /> : bio?.trim() ? <p className="mt-3 whitespace-pre-wrap break-words text-center text-[14px] leading-relaxed text-white/85">{bio.trim()}</p> : null}
            {language || flag || languageName ? (
              <div className={`${name?.trim() || handle?.trim() || bio?.trim() ? "mt-4 border-t border-white/15 pt-3" : ""} flex items-center justify-center gap-2`}>
                {language ? (
                  <LanguageFlag language={language} className="text-[1.35rem] leading-none" />
                ) : flag ? (
                  <FlagEmoji emoji={flag} className="text-[1.35rem] leading-none" />
                ) : null}
                <span className="flex flex-col items-start">
                  {languageLabel ? <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/55">{languageLabel}</span> : null}
                  {languageName ? <span className="text-[14px] font-semibold">{languageName}</span> : null}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
