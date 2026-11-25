"use client";

import { AudioLines, Headphones, Loader2, Volume2 } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  getNativeAudioRouteServerSnapshot,
  getNativeAudioRouteSnapshot,
  subscribeNativeAudioRoute,
} from "@/lib/native-audio-route";
import type { ReadAloudStatus } from "@/components/feed/post-read-aloud";

type PostReadAloudButtonProps = {
  status: ReadAloudStatus;
  label: string;
  stopLabel: string;
  onPress: () => void;
};

/**
 * Sits after the language flags: reads the post in the picked language.
 * A speaker icon, or earphones while the app reports them connected (the
 * clip plays there instead).
 */
export default function PostReadAloudButton({ status, label, stopLabel, onPress }: PostReadAloudButtonProps) {
  const route = useSyncExternalStore(
    subscribeNativeAudioRoute,
    getNativeAudioRouteSnapshot,
    getNativeAudioRouteServerSnapshot,
  );
  const busy = status !== "idle";
  const name = busy ? stopLabel : label;
  const Icon = route.earphonesConnected ? Headphones : Volume2;

  return (
    <button
      type="button"
      data-feed-action
      data-post-read-aloud
      aria-label={name}
      aria-pressed={busy}
      aria-busy={status === "loading"}
      title={name}
      onClick={onPress}
      className="relative inline-flex h-11 w-10 shrink-0 items-center justify-center"
    >
      <span
        aria-hidden="true"
        className={`inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border bg-white shadow-[0_2px_7px_rgba(15,23,42,0.18)] transition-transform active:scale-95 ${
          busy ? "border-amber-400 text-amber-600 ring-2 ring-amber-300/80" : "border-white/70 text-slate-700"
        }`}
      >
        {status === "loading" ? (
          <Loader2 size={15} strokeWidth={2.4} className="animate-spin" />
        ) : status === "playing" ? (
          <AudioLines size={16} strokeWidth={2.4} className="animate-pulse" />
        ) : (
          <Icon size={16} strokeWidth={2.3} />
        )}
      </span>
    </button>
  );
}
