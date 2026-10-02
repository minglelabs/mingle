"use client";

import LanguageFlag from "@/components/language-flag";
import { getSttLanguageDisplayName } from "@/lib/stt-languages";
import { Globe, Loader2 } from "lucide-react";
import Image from "next/image";

export const ORIGINAL_CHIP = "original";

type PostLanguageChipsProps = {
  /** The language the post was written in; null when it was never detected. */
  sourceLanguage: string | null;
  /** Translations the reader can switch to, in display order. */
  languages: readonly string[];
  /** `ORIGINAL_CHIP` or one of `languages`. */
  selected: string;
  /** The language whose translation is being fetched, if any. */
  loadingLanguage: string | null;
  locale: string;
  originalLabel: string;
  onSelect: (language: string) => void;
};

/**
 * One flag per language a post can be read in — the same flags as a collapsed
 * chat bubble, with the same quote badge marking the original.
 */
export default function PostLanguageChips({
  sourceLanguage,
  languages,
  selected,
  loadingLanguage,
  locale,
  originalLabel,
  onSelect,
}: PostLanguageChipsProps) {
  const chips = [ORIGINAL_CHIP, ...languages];

  return (
    <div className="flex min-w-0 items-center gap-1.5" data-post-language-chips>
      {chips.map((chip) => {
        const isOriginal = chip === ORIGINAL_CHIP;
        const language = isOriginal ? sourceLanguage : chip;
        const isSelected = chip === selected;
        const name = language ? getSttLanguageDisplayName(language, locale) || language : "";
        const label = isOriginal ? (name ? `${originalLabel}: ${name}` : originalLabel) : name;
        return (
          <button
            key={chip}
            type="button"
            data-feed-action
            aria-label={label}
            aria-pressed={isSelected}
            aria-busy={loadingLanguage === chip}
            title={label}
            onClick={() => onSelect(chip)}
            className="relative inline-flex h-11 w-9 shrink-0 items-center justify-center"
          >
            <span
              aria-hidden="true"
              className={`relative inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border bg-white text-[17px] leading-none shadow-[0_2px_7px_rgba(15,23,42,0.18)] transition-transform active:scale-95 ${
                isSelected ? "border-amber-400 ring-2 ring-amber-300/80" : "border-white/70 opacity-80"
              }`}
            >
              {loadingLanguage === chip ? (
                <Loader2 size={15} strokeWidth={2.4} className="animate-spin text-slate-500" />
              ) : language ? (
                <LanguageFlag language={language} className="text-[17px] leading-none" />
              ) : (
                <Globe size={15} strokeWidth={2.2} className="text-slate-600" />
              )}
              {isOriginal ? (
                <span className="absolute -right-1 -top-1 inline-flex h-[13px] w-[13px] items-center justify-center overflow-hidden rounded-full border border-white bg-white shadow-[0_1px_3px_rgba(15,23,42,0.18)]">
                  <Image
                    src="/chat/original-language-quote.png"
                    alt=""
                    width={12}
                    height={12}
                    className="h-[11px] w-[11px] object-contain"
                    unoptimized
                  />
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
