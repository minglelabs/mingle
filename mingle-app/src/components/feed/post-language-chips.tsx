"use client";

import LanguageFlag from "@/components/language-flag";
import { getSttLanguageDisplayName } from "@/lib/stt-languages";
import { Globe, Loader2, MoreHorizontal, Plus } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useState } from "react";
import { isLanguageReady } from "@/lib/language-chips";

// Opened by the "..." button only: not loaded with every card.
const LanguageSearchScreen = dynamic(() => import("@/components/language-search-screen"), { ssr: false });

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
  /**
   * Languages behind "more languages" (owner, 2026-11-25): a button after the
   * flags opens them in the same row, which then scrolls sideways.
   */
  moreLanguages?: readonly string[];
  moreLabel?: string;
  /**
   * Languages a translation is already made in. A flag outside this list is
   * drawn faded and translated when tapped. Omitted: every flag is drawn ready.
   */
  readyLanguages?: readonly string[];
  /**
   * "..." at the end of the opened row (or right after the flags when there
   * is nothing behind "+"): opens the language search screen to read the text
   * in any other language. The picked language is handed to `onSelect`.
   */
  searchLabel?: string;
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
  moreLanguages = [],
  moreLabel = "",
  readyLanguages,
  searchLabel = "",
}: PostLanguageChipsProps) {
  const [opened, setOpened] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Mounted on the first tap, kept afterwards so it can slide back out.
  const [searchMounted, setSearchMounted] = useState(false);
  // Languages picked on the search screen: kept at the end of the row.
  const [picked, setPicked] = useState<string[]>([]);
  const shown = (code: string) => [...languages, ...moreLanguages].some((language) => language.toLowerCase() === code.toLowerCase());
  const extra = [...moreLanguages, ...picked.filter((code) => !shown(code) && code.toLowerCase() !== (sourceLanguage ?? "").toLowerCase())];
  // A language picked from the rest stays in view after a reload of the card.
  const expanded = opened || extra.includes(selected) || (loadingLanguage !== null && extra.includes(loadingLanguage));
  const chips = [ORIGINAL_CHIP, ...languages, ...(expanded ? extra : [])];
  const showSearch = Boolean(searchLabel) && (expanded || extra.length === 0);

  return (
    <div
      className={`flex min-w-0 items-center gap-1.5 ${expanded ? "overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : ""}`}
      data-post-language-chips
      data-expanded={expanded ? "true" : "false"}
    >
      {chips.map((chip) => {
        const isOriginal = chip === ORIGINAL_CHIP;
        const language = isOriginal ? sourceLanguage : chip;
        const isSelected = chip === selected;
        const name = language ? getSttLanguageDisplayName(language, locale) || language : "";
        const label = isOriginal ? (name ? `${originalLabel}: ${name}` : originalLabel) : name;
        // Not translated yet: faded until it is tapped (and translated).
        const ready = isOriginal || !readyLanguages || isLanguageReady(chip, readyLanguages) || loadingLanguage === chip;
        return (
          <button
            key={chip}
            type="button"
            data-feed-action
            aria-label={label}
            aria-pressed={isSelected}
            aria-busy={loadingLanguage === chip}
            title={label}
            data-ready={ready ? "true" : "false"}
            onClick={() => onSelect(chip)}
            className="relative inline-flex h-11 w-9 shrink-0 items-center justify-center"
          >
            <span
              aria-hidden="true"
              className={`relative inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border bg-white text-[17px] leading-none shadow-[0_2px_7px_rgba(15,23,42,0.18)] transition-transform active:scale-95 ${
                isSelected ? "border-amber-400 ring-2 ring-amber-300/80" : ready ? "border-white/70 opacity-80" : "border-white/70 opacity-40 saturate-50"
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
      {!expanded && extra.length > 0 ? (
        <button
          type="button"
          data-feed-action
          data-qa="language-chips-more"
          aria-label={moreLabel}
          title={moreLabel}
          onClick={() => setOpened(true)}
          className="relative inline-flex h-11 w-9 shrink-0 items-center justify-center"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border border-white/70 bg-white text-slate-600 opacity-80 shadow-[0_2px_7px_rgba(15,23,42,0.18)] transition-transform active:scale-95"
          >
            <Plus size={16} strokeWidth={2.6} />
          </span>
        </button>
      ) : null}
      {showSearch ? (
        <button
          type="button"
          data-feed-action
          data-qa="language-chips-search"
          aria-label={searchLabel}
          title={searchLabel}
          onClick={() => {
            setSearchMounted(true);
            setSearchOpen(true);
          }}
          className="relative inline-flex h-11 w-9 shrink-0 items-center justify-center"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border border-white/70 bg-white text-slate-600 opacity-80 shadow-[0_2px_7px_rgba(15,23,42,0.18)] transition-transform active:scale-95"
          >
            <MoreHorizontal size={17} strokeWidth={2.6} />
          </span>
        </button>
      ) : null}
      {searchMounted ? (
        <LanguageSearchScreen
          open={searchOpen}
          locale={locale}
          onClose={() => setSearchOpen(false)}
          onPick={(language) => {
            setSearchOpen(false);
            if (language.toLowerCase() === (sourceLanguage ?? "").toLowerCase()) {
              onSelect(ORIGINAL_CHIP);
              return;
            }
            setPicked((current) => (current.includes(language) ? current : [...current, language]));
            setOpened(true);
            onSelect(language);
          }}
        />
      ) : null}
    </div>
  );
}
