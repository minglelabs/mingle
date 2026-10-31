"use client";

import { LANGUAGE_LEVEL_COUNT } from "@/lib/interest-languages";
import { resolveInterestLanguageCopy } from "@/i18n/interest-language-copy";

/** Five tappable dots for a 1-5 language level, with the level's label. */
export default function LanguageLevelPicker({
  level,
  locale,
  onChange,
  disabled = false,
  size = "default",
}: {
  level: number;
  locale: string;
  onChange: (level: number) => void;
  disabled?: boolean;
  size?: "default" | "large";
}) {
  const copy = resolveInterestLanguageCopy(locale);
  const isLarge = size === "large";
  return (
    <div className={isLarge ? "flex flex-col items-center gap-1" : "flex items-center gap-3"}>
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
              className={`flex ${isLarge ? "h-11 w-11" : "h-9 w-9"} items-center justify-center rounded-full transition active:bg-amber-50 disabled:opacity-50`}
            >
              <span className={`${isLarge ? "h-5 w-5" : "h-3.5 w-3.5"} rounded-full ${value <= level ? "bg-amber-500" : "bg-gray-200"}`} />
            </button>
          );
        })}
      </div>
      <span className={`min-w-0 truncate font-semibold text-slate-700 ${isLarge ? "text-[1.05rem]" : "text-[13px]"}`}>{copy.levelLabels[level - 1]}</span>
    </div>
  );
}
