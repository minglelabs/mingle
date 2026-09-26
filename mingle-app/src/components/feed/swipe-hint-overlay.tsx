"use client";

import { useReducedMotion } from "@/components/feed/use-reduced-motion";
import { ChevronUp, X } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

const SWIPE_HINT_STORAGE_KEY = "mingle:feed-swipe-hint-done";

function readHintDone(): boolean {
  try {
    return window.localStorage.getItem(SWIPE_HINT_STORAGE_KEY) === "1";
  } catch {
    // Storage unavailable: never nag.
    return true;
  }
}

const subscribeToNothing = () => () => {};
// Server render and hydration treat the hint as done, so the markup matches.
const readHintDoneOnServer = () => true;

type SwipeHintOverlayProps = {
  /** Whether there is a next post to swipe to. */
  hasNextPost: boolean;
  /** Called once the hint is dismissed (swiped or closed). */
  onDismiss?: () => void;
  /** Hint text; pass `copy.swipeHint` ("swipe up for the next post"). */
  label: string;
  /** Accessible name of the close button; pass `copy.swipeHintClose`. */
  closeLabel?: string;
};

export default function SwipeHintOverlay({
  hasNextPost,
  onDismiss,
  label,
  closeLabel,
}: SwipeHintOverlayProps) {
  const reducedMotion = useReducedMotion();
  const hintDone = useSyncExternalStore(subscribeToNothing, readHintDone, readHintDoneOnServer);
  const [dismissed, setDismissed] = useState(false);
  const visible = hasNextPost && !hintDone && !dismissed;

  const dismiss = useCallback(() => {
    setDismissed(true);
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

  // The overlay never intercepts touches: the swipe it teaches must reach the
  // feed scroller underneath (that first swipe is what completes the hint).
  // Only the close button takes pointer events.
  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/30"
      role="status"
      aria-label={label}
      data-swipe-hint
    >
      <div className="flex flex-col items-center gap-3 text-white">
        <div className={reducedMotion ? undefined : "animate-bounce"} aria-hidden="true">
          <ChevronUp size={40} strokeWidth={2.5} />
        </div>
        <p className="text-base font-semibold drop-shadow-md">{label}</p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          className="pointer-events-auto relative mt-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm transition active:scale-90 before:absolute before:-inset-1.5 before:content-['']"
          aria-label={closeLabel ?? label}
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
