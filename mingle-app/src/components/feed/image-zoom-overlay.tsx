"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

type ImageZoomOverlayProps = {
  open: boolean;
  src: string;
  alt: string;
  closeLabel: string;
  reducedMotion: boolean;
  onClose: () => void;
};

/**
 * Full-screen image zoom. Preserves the original aspect ratio (`object-contain`)
 * with the empty area filled by a dark backdrop — never cropped. While open the
 * feed behind must not scroll (the shell blocks it), and closing returns to the
 * same post.
 */
export default function ImageZoomOverlay({
  open,
  src,
  alt,
  closeLabel,
  reducedMotion,
  onClose,
}: ImageZoomOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black"
      style={{ animation: reducedMotion ? undefined : "feed-zoom-fade 160ms ease-out" }}
      role="dialog"
      aria-modal="true"
      aria-label={alt || closeLabel}
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-h-full max-w-full object-contain"
        draggable={false}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm transition active:scale-90"
        style={{ top: "calc(env(safe-area-inset-top, 16px) + 8px)" }}
        aria-label={closeLabel}
      >
        <X size={22} strokeWidth={2.5} className="text-white" />
      </button>
      <style>{`@keyframes feed-zoom-fade { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
  );
}
