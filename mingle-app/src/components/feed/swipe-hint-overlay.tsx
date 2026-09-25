"use client";

import { ChevronUp, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const SWIPE_HINT_STORAGE_KEY = "mingle:feed-swipe-hint-done";

type SwipeHintOverlayProps = {
  /** Whether there is a next post to swipe to. */
  hasNextPost: boolean;
  /** Called once the hint is dismissed (swiped or closed). */
  onDismiss?: () => void;
  label: string;
};

export default function SwipeHintOverlay({
  hasNextPost,
  onDismiss,
  label,
}: SwipeHintOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hasNextPost) return;
    try {
      const done = window.localStorage.getItem(SWIPE_HINT_STORAGE_KEY);
      if (done === "1") return;
    } catch {
      return;
    }
    setVisible(true);
  }, [hasNextPost]);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      window.localStorage.setItem(SWIPE_HINT_STORAGE_KEY, "1");
    } catch {
      // Ignore storage failures.
    }
    onDismiss?.();
  }, [onDismiss]);

  // Auto-dismiss after first scroll (parent will call this)
  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(dismiss, 6000);
    return () => window.clearTimeout(timer);
  }, [dismiss, visible]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/30"
      onClick={dismiss}
      role="dialog"
      aria-modal="false"
      aria-label={label}
    >
      <div className="flex flex-col items-center gap-3 text-white">
        <div className="animate-bounce">
          <ChevronUp size={40} strokeWidth={2.5} />
        </div>
        <p className="text-base font-semibold drop-shadow-md">{label}</p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          className="mt-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm transition active:scale-90"
          aria-label="Close"
        >
          <X size={18} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

/** Mark the hint as completed (e.g. after first successful swipe). */
export function markSwipeHintDone(): void {
  try {
    window.localStorage.setItem(SWIPE_HINT_STORAGE_KEY, "1");
  } catch {
    // Ignore.
  }
}
