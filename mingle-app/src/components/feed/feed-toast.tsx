"use client";

import { useEffect } from "react";

type FeedToastProps = {
  message: string | null;
  onDismiss: () => void;
  reducedMotion: boolean;
};

/**
 * Transient status message for feed feedback (like/follow failure, rate-limit
 * "try again in Ns"). Auto-dismisses; announced politely to screen readers.
 */
export default function FeedToast({ message, onDismiss, reducedMotion }: FeedToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, 3200);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-40 flex justify-center px-4"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
    >
      <div
        role="status"
        aria-live="polite"
        className="max-w-[85%] rounded-full bg-black/80 px-4 py-2 text-center text-sm font-medium text-white backdrop-blur-sm"
        style={{ animation: reducedMotion ? undefined : "feed-toast-in 160ms ease-out" }}
      >
        {message}
      </div>
      <style>{`@keyframes feed-toast-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }`}</style>
    </div>
  );
}
