"use client";

import { buildProfileImageTransform, type ProfileImageCropInput } from "@/lib/profile-image-crop";
import { X, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

type ProfileImagePreviewProps = {
  open: boolean;
  image: string | null;
  alt: string;
  crop?: ProfileImageCropInput;
  flag?: string | null;
  languageName?: string | null;
  closeLabel: string;
  onClose: () => void;
};

const PREVIEW_MAX_SIZE = 420;

export default function ProfileImagePreview({
  open,
  image,
  alt,
  crop,
  flag,
  languageName,
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-black/80 px-5 py-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),24px)]"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
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

        {flag || languageName ? (
          <div className="mt-5 flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-white backdrop-blur-sm">
            {flag ? <span className="text-[1.45rem] leading-none" aria-hidden="true">{flag}</span> : null}
            {languageName ? <span className="text-[15px] font-semibold">{languageName}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
