"use client";

import { LANGUAGE_LEVEL_COUNT } from "@/lib/interest-languages";
import { resolveInterestLanguageCopy } from "@/i18n/interest-language-copy";

/** Five tappable dots for a 1-5 language level, with the level's label. */
export default function LanguageLevelPicker({
  level,
  locale,
  onChange,
  disabled = false,
}: {
  level: number;
  locale: string;
  onChange: (level: number) => void;
  disabled?: boolean;
}) {
  const copy = resolveInterestLanguageCopy(locale);
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1" role="radiogroup" aria-label={copy.levelQuestion}>
        {Array.from({ length: LANGUAGE_LEVEL_COUNT }, (_, index) => {
          const value = index + 1;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={level === value}
              aria-label={`${copy.levelAriaLabel.replace("{level}", String(value))} · ${copy.levelLabels[index]}`}
              disabled={disabled}
              onClick={() => onChange(value)}
              className="flex h-9 w-9 items-center justify-center rounded-full transition active:bg-amber-50 disabled:opacity-50"
            >
              <span className={`h-3.5 w-3.5 rounded-full ${value <= level ? "bg-amber-500" : "bg-gray-200"}`} />
            </button>
          );
        })}
      </div>
      <span className="min-w-0 truncate text-[13px] font-semibold text-slate-700">{copy.levelLabels[level - 1]}</span>
    </div>
  );
}
