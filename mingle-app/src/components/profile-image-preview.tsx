"use client";

import { buildProfileImageTransform, type ProfileImageCropInput } from "@/lib/profile-image-crop";
import {
  postNativeAndroidBackCapability,
  registerNativeBackHandler,
} from "@/lib/native-back-handler";
import LanguageFlag from "@/components/language-flag";
import { X, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

type ProfileImagePreviewProps = {
  open: boolean;
  image: string | null;
  alt: string;
  crop?: ProfileImageCropInput;
  language?: string | null;
  flag?: string | null;
  languageName?: string | null;
  languageLabel?: string | null;
  name?: string | null;
  handle?: string | null;
  bio?: string | null;
  closeLabel: string;
  onClose: () => void;
};

const PREVIEW_MAX_SIZE = 420;

export default function ProfileImagePreview({
  open,
  image,
  alt,
  crop,
  language,
  flag,
  languageName,
  languageLabel,
  name,
  handle,
  bio,
  closeLabel,
  onClose,
}: ProfileImagePreviewProps) {
  const [previewSize, setPreviewSize] = useState(320);

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
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;

    postNativeAndroidBackCapability(true);
    return () => postNativeAndroidBackCapability(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 80);
  }, [onClose, open]);

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
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-[max(env(safe-area-inset-top),16px)] flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 active:bg-white/30"
        aria-label={closeLabel}
      >
        <X size={24} strokeWidth={2.1} aria-hidden="true" />
      </button>

      <div className="flex max-w-full flex-col items-center">
        <div
          className="overflow-hidden rounded-full border border-white/20 bg-white/10 shadow-[0_24px_70px_rgba(0,0,0,0.45)]"
          style={{ height: previewSize, width: previewSize }}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={alt}
              width={previewSize}
              height={previewSize}
              className="h-full w-full object-cover"
              style={{ transform: buildProfileImageTransform(previewSize, crop) }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <UserRound size={Math.round(previewSize * 0.42)} className="text-white/55" aria-hidden="true" />
            </div>
          )}
        </div>

        {(name?.trim() || handle?.trim() || bio?.trim() || language || flag || languageName) ? (
          <div className="mt-5 w-full max-w-[min(20rem,85vw)] rounded-[24px] border border-white/15 bg-white/12 px-5 py-4 text-white shadow-[0_12px_36px_rgba(0,0,0,0.18)] backdrop-blur-md">
            {name?.trim() ? <p className="truncate text-center text-[19px] font-semibold tracking-[-0.01em]">{name.trim()}</p> : null}
            {handle?.trim() ? <p className="mt-0.5 truncate text-center text-[13px] text-white/65">@{handle.trim().replace(/^@+/, "")}</p> : null}
            {bio?.trim() ? <p className="mt-3 whitespace-pre-wrap break-words text-center text-[14px] leading-relaxed text-white/85">{bio.trim()}</p> : null}
            {language || flag || languageName ? (
              <div className={`${name?.trim() || handle?.trim() || bio?.trim() ? "mt-4 border-t border-white/15 pt-3" : ""} flex items-center justify-center gap-2`}>
                {language ? (
                  <LanguageFlag language={language} className="text-[1.35rem] leading-none" />
                ) : flag ? (
                  <span className="text-[1.35rem] leading-none" aria-hidden="true">{flag}</span>
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
