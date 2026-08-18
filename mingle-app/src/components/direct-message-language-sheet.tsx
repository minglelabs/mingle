"use client";

import type { AppLocale } from "@/i18n";
import LanguagePreferencePicker from "@/components/language-preference-picker";
import {
  MAX_STT_LANGUAGE_SELECTION,
  getSttLanguageDisplayName,
  type SttLanguageCode,
} from "@/lib/stt-languages";
import { X } from "lucide-react";

export type DirectMessageLanguageSheetCopy = {
  title: string;
  description: string;
  defaultLanguageBadge: string;
  done: string;
  close: string;
};

export type DirectMessageLanguageSheetSelectorCopy = {
  searchPlaceholder: string;
  sortLocaleLabel: string;
  sortAlphabeticalLabel: string;
  noResultsLabel: string;
};

type DirectMessageLanguageSheetProps = {
  locale: AppLocale;
  copy: DirectMessageLanguageSheetCopy;
  selectorCopy: DirectMessageLanguageSheetSelectorCopy;
  defaultLanguage: string;
  selectedLanguages: string[];
  onToggleLanguage: (code: SttLanguageCode) => void;
  onClose: () => void;
  isSaving: boolean;
};

/**
 * The per-room "which languages should I read this in" picker, opened from
 * the direct-message header. Saving happens on close (there's no separate
 * confirm step) — every toggle just updates local state until then.
 */
export default function DirectMessageLanguageSheet({
  locale,
  copy,
  selectorCopy,
  defaultLanguage,
  selectedLanguages,
  onToggleLanguage,
  onClose,
  isSaving,
}: DirectMessageLanguageSheetProps) {
  return (
    <div className="fixed inset-0 z-[120] flex flex-col justify-end bg-black/30">
      <div className="flex max-h-[80vh] min-h-0 flex-col rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom,0px)]">
        <div className="flex shrink-0 items-start gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-bold">{copy.title}</h2>
            <p className="mt-0.5 break-keep text-[12px] leading-snug text-gray-500">
              {copy.description}
            </p>
            {defaultLanguage ? (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                {copy.defaultLanguageBadge}
                {getSttLanguageDisplayName(defaultLanguage, locale) || defaultLanguage}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:bg-gray-100"
            aria-label={copy.close}
          >
            <X size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <LanguagePreferencePicker
            selectedLanguages={selectedLanguages}
            onToggleLanguage={onToggleLanguage}
            uiLocale={locale}
            searchPlaceholder={selectorCopy.searchPlaceholder}
            sortLocaleLabel={selectorCopy.sortLocaleLabel}
            sortAlphabeticalLabel={selectorCopy.sortAlphabeticalLabel}
            noResultsLabel={selectorCopy.noResultsLabel}
            maxLanguages={MAX_STT_LANGUAGE_SELECTION}
            minLanguages={0}
            disabled={isSaving}
          />
        </div>
        <div className="shrink-0 border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex h-11 w-full items-center justify-center rounded-full bg-amber-500 text-[14px] font-semibold text-white transition active:bg-amber-600 disabled:opacity-50"
          >
            {copy.done}
          </button>
        </div>
      </div>
    </div>
  );
}
