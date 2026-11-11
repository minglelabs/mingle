"use client";

import { X } from "lucide-react";
import SpeechLengthScale from "@/components/LivePhoneDemo/SpeechLengthScale";
import type { FirstRunCopy } from "@/i18n/first-run-copy";
import type { SpeechLengthLevel } from "@/lib/speech-length";

/**
 * Shown once, right after a new user's first finished bubble: how long a
 * sentence should be kept together. The current level is already selected, so
 * the card can be ignored or closed; a tap applies the choice at once.
 */
export default function SpeechLengthCard({
  copy,
  selected,
  disabled = false,
  onSelect,
  onClose,
}: {
  copy: FirstRunCopy;
  selected: SpeechLengthLevel;
  disabled?: boolean;
  onSelect: (level: SpeechLengthLevel) => void;
  onClose: () => void;
}) {
  return (
    <div
      role="group"
      aria-label={copy.lengthTitle}
      data-qa="speech-length-card"
      className="pointer-events-auto w-full max-w-[420px] rounded-[1.4rem] border border-amber-200 bg-white px-4 pb-4 pt-3 shadow-[0_18px_44px_rgba(15,23,42,0.18)]"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[1rem] font-bold leading-snug text-slate-950">{copy.lengthTitle}</p>
          <p className="mt-0.5 text-[0.78rem] leading-snug text-slate-500">{copy.lengthHint}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={copy.lengthClose}
          className="-mr-1.5 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        >
          <X size={18} strokeWidth={2.4} aria-hidden />
        </button>
      </div>
      <div className="mt-3">
        <SpeechLengthScale copy={copy} selected={selected} disabled={disabled} onSelect={onSelect} />
      </div>
    </div>
  );
}
