"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ZoomableConversationImage } from "@/components/LivePhoneDemo/ZoomableConversationImage";
import { backdropOpacityForProgress } from "@/components/LivePhoneDemo/swipe-to-dismiss.logic";

type ImageZoomOverlayProps = {
  open: boolean;
  src: string;
  alt: string;
  closeLabel: string;
  reducedMotion: boolean;
  onClose: () => void;
};

type NaturalSize = { src: string; width: number; height: number };

/**
 * Full-screen image viewer. Preserves the original aspect ratio (contain-fit)
 * on a dark backdrop, never cropped. Pinch (or trackpad pinch / double tap)
 * zooms up to 4x and a zoomed photo pans; at base zoom a swipe down drags the
 * photo away and closes the viewer, with the backdrop fading as it goes. The
 * gestures are the chat photo viewer's (ZoomableConversationImage). While open
 * the feed behind must not scroll (the shell blocks it), and closing returns to
 * the same post.
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

  if (!open || !src) return null;
  // Keyed by src so each photo starts at base zoom with no leftover drag.
  return (
    <ImageZoomOverlayContent
      key={src}
      src={src}
      alt={alt}
      closeLabel={closeLabel}
      reducedMotion={reducedMotion}
      onClose={onClose}
    />
  );
}

function ImageZoomOverlayContent({
  src,
  alt,
  closeLabel,
  reducedMotion,
  onClose,
}: Omit<ImageZoomOverlayProps, "open">) {
  // The zoom stage needs the photo's natural size for its contain-fit rect.
  const [size, setSize] = useState<NaturalSize | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (cancelled) return;
      setSize({ src, width: probe.naturalWidth || 1, height: probe.naturalHeight || 1 });
    };
    probe.onerror = () => {
      if (!cancelled) setFailed(true);
    };
    probe.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  const [dragProgress, setDragProgress] = useState(0);
  const [settling, setSettling] = useState(false);
  const handleDragProgress = useCallback((progress: number) => setDragProgress(progress), []);
  const handleSettleChange = useCallback((next: boolean) => setSettling(next), []);
  const fadeTransition = settling ? "opacity 200ms ease-out" : undefined;

  return (
    <div
      className="fixed inset-0 z-50"
      style={{ animation: reducedMotion ? undefined : "feed-zoom-fade 160ms ease-out" }}
      role="dialog"
      aria-modal="true"
      aria-label={alt || closeLabel}
      onClick={(e) => {
        // A tap on the dark area closes; a tap on the photo itself does not
        // (a double tap there zooms).
        if ((e.target as Element).closest?.("[data-conversation-image-stage]")) return;
        onClose();
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black"
        style={{ opacity: backdropOpacityForProgress(dragProgress), transition: fadeTransition }}
      />
      <div className="absolute inset-0">
        {size && !failed ? (
          <ZoomableConversationImage
            src={size.src}
            alt={alt}
            width={size.width}
            height={size.height}
            onError={() => setFailed(true)}
            onDismiss={onClose}
            onDragProgress={handleDragProgress}
            onSettleChange={handleSettleChange}
          />
        ) : null}
      </div>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm transition active:scale-90"
        style={{
          top: "calc(env(safe-area-inset-top, 16px) + 8px)",
          opacity: Math.max(0, 1 - dragProgress * 2),
          transition: fadeTransition,
        }}
        aria-label={closeLabel}
      >
        <X size={22} strokeWidth={2.5} className="text-white" />
      </button>
      <style>{`@keyframes feed-zoom-fade { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
  );
}
