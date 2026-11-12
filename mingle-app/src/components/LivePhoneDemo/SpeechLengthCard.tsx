"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import SpeechLengthScale from "@/components/LivePhoneDemo/SpeechLengthScale";
import type { FirstRunCopy } from "@/i18n/first-run-copy";
import { groupSpeechLengthPreview, type SpeechLengthLevel } from "@/lib/speech-length";

/**
 * Shown once, right after a new user's first finished bubble: how long a
 * sentence should be kept together. Picking a number only changes the example
 * conversation above the scale, where the bubbles merge or split as that
 * level would; "Apply" is what changes the setting (and, if the room is
 * listening, restarts it). The current level starts selected, so the card can
 * also just be closed.
 */
export default function SpeechLengthCard({
  copy,
  selected,
  disabled = false,
  onApply,
  onClose,
}: {
  copy: FirstRunCopy;
  selected: SpeechLengthLevel;
  disabled?: boolean;
  onApply: (level: SpeechLengthLevel) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<SpeechLengthLevel>(selected);
  const bubbles = useMemo(() => groupSpeechLengthPreview(picked, copy.lengthPreview), [copy.lengthPreview, picked]);

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
      <div
        aria-hidden
        data-qa="speech-length-preview"
        data-bubbles={bubbles.length}
        className="mt-3 flex flex-col items-end gap-1.5 rounded-2xl bg-slate-50 px-3 py-2.5"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {bubbles.map((bubble) => (
            <motion.div
              key={bubble.key}
              layout
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.7 }}
              className="max-w-[86%] rounded-[1.05rem] rounded-br-md bg-amber-400 px-3 py-1.5 text-[0.82rem] font-medium leading-snug text-slate-950"
            >
              {bubble.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="mt-3">
        <SpeechLengthScale copy={copy} selected={picked} disabled={disabled} onSelect={setPicked} />
      </div>
      <button
        type="button"
        data-qa="speech-length-apply"
        disabled={disabled}
        onClick={() => onApply(picked)}
        className="mt-3 flex h-12 w-full items-center justify-center rounded-2xl bg-slate-950 text-[0.98rem] font-bold text-white transition active:scale-[0.99] disabled:opacity-50"
      >
        {copy.lengthApply}
      </button>
    </div>
  );
}
