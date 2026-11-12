"use client";

import type { FirstRunCopy } from "@/i18n/first-run-copy";
import { SPEECH_LENGTH_LEVELS, type SpeechLengthLevel } from "@/lib/speech-length";

/**
 * The sentence length scale: six numbered steps from short to long, with what
 * each end suits written under it. Used by the first-run card and by the room
 * settings, so both show the same thing.
 */
export default function SpeechLengthScale({
  copy,
  selected,
  disabled = false,
  onSelect,
}: {
  copy: FirstRunCopy;
  selected: SpeechLengthLevel;
  disabled?: boolean;
  onSelect: (level: SpeechLengthLevel) => void;
}) {
  return (
    <div data-qa="speech-length-scale">
      <div role="radiogroup" aria-label={copy.lengthMenuLabel} className="grid grid-cols-6 gap-1.5">
        {SPEECH_LENGTH_LEVELS.map((level) => {
          const isSelected = selected === level;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              data-qa={`speech-length-${level}`}
              onClick={() => onSelect(level)}
              className={`flex h-11 items-center justify-center rounded-xl border text-[1rem] font-bold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 ${
                isSelected
                  ? "border-amber-500 bg-amber-500 text-white shadow-[0_6px_14px_rgba(245,158,11,0.3)]"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {level}
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex items-start justify-between gap-3 text-[0.74rem] leading-snug text-slate-500">
        <span className="min-w-0">
          <span className="block font-semibold text-slate-700">{copy.lengthShort}</span>
          {copy.lengthShortHint}
        </span>
        <span className="min-w-0 text-right">
          <span className="block font-semibold text-slate-700">{copy.lengthLong}</span>
          {copy.lengthLongHint}
        </span>
      </div>
    </div>
  );
}
