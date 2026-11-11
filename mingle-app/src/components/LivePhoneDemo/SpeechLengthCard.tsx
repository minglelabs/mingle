"use client";

import { Check, X } from "lucide-react";
import type { FirstRunCopy } from "@/i18n/first-run-copy";
import { SPEECH_LENGTH_OPTIONS, type SpeechLengthOption } from "@/lib/speech-length";

/**
 * Shown once, right after a new user's first translation: how long a sentence
 * should be kept together. The current setting is already selected, so the
 * card can be ignored or closed; a tap applies the choice at once.
 */
export default function SpeechLengthCard({
  copy,
  selected,
  disabled = false,
  onSelect,
  onClose,
}: {
  copy: FirstRunCopy;
  selected: SpeechLengthOption | null;
  disabled?: boolean;
  onSelect: (option: SpeechLengthOption) => void;
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
      <div className="mt-3 grid grid-cols-2 gap-2">
        {SPEECH_LENGTH_OPTIONS.map((option) => {
          const isSelected = selected === option;
          const { label, hint } = copy.lengthOptions[option];
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              data-qa={`speech-length-${option}`}
              onClick={() => onSelect(option)}
              className={`flex min-h-[58px] flex-col items-start justify-center rounded-[1rem] border px-3 py-2 text-left transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-60 ${
                isSelected
                  ? "border-amber-400 bg-amber-50"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <span className="flex w-full items-center gap-1.5">
                <span className="min-w-0 flex-1 text-[0.95rem] font-semibold leading-snug text-slate-900">{label}</span>
                {isSelected ? <Check size={16} strokeWidth={3} className="shrink-0 text-amber-600" aria-hidden /> : null}
              </span>
              {hint ? <span className="mt-0.5 text-[0.74rem] leading-snug text-slate-500">{hint}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
