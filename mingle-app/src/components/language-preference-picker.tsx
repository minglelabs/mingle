"use client";

import {
  buildLanguageSelectorFeaturedItems,
  buildLanguageSelectorItems,
  filterLanguageSelectorItems,
  resolveDefaultLanguageSelectorSortMode,
  resolveLanguageSelectorLocale,
  resolveLanguageSelectorSectionCopy,
  resolveLanguageSelectorShowsSortToggle,
  sortLanguageSelectorItems,
  type LanguageSelectorSortMode,
} from "@/components/LivePhoneDemo/language-selector.logic";
import LanguageFlag from "@/components/language-flag";
import {
  MAX_STT_LANGUAGE_SELECTION,
  getSttLanguageDisplayName,
  sanitizeSttLanguageSelection,
  type SttLanguageCode,
} from "@/lib/stt-languages";
import { Check, Search } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

type LanguagePreferencePickerProps = {
  selectedLanguages: readonly string[];
  onToggleLanguage: (code: SttLanguageCode) => void;
  uiLocale: string;
  searchPlaceholder: string;
  sortLocaleLabel: string;
  sortAlphabeticalLabel: string;
  noResultsLabel: string;
  maxLanguages?: number;
  minLanguages?: number;
  disabled?: boolean;
};

function LanguageOptionButton({
  option,
  selected,
  disabled,
  onSelect,
}: {
  option: ReturnType<typeof buildLanguageSelectorItems>[number];
  selected: boolean;
  disabled: boolean;
  onSelect: (code: SttLanguageCode) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(option.code)}
      disabled={disabled}
      className={`flex w-full items-center gap-4 rounded-[1.6rem] border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? "border-amber-400 bg-amber-50/95 shadow-[0_16px_32px_rgba(245,158,11,0.12)]"
          : "border-[#ece6db] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.05)] hover:-translate-y-[1px] hover:border-slate-300 hover:shadow-[0_18px_36px_rgba(15,23,42,0.08)]"
      }`}
      aria-pressed={selected}
    >
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border shadow-sm ${selected
        ? "border-amber-300 bg-white shadow-[0_6px_14px_rgba(245,158,11,0.08)]"
        : "border-[#e5dfd5] bg-[#faf7f1]"}`}
      >
        <LanguageFlag language={option.code} className="text-[2rem] leading-none" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[1rem] font-semibold tracking-[-0.01em] text-slate-950">
          {option.localizedName}
        </span>
        <span className="mt-0.5 block truncate text-[0.9rem] text-slate-500">{option.secondaryLabel}</span>
      </span>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${selected
        ? "border-amber-500 bg-amber-500 text-white"
        : "border-slate-300 text-transparent"}`}
      >
        <Check aria-hidden="true" size={16} strokeWidth={3.2} />
      </span>
    </button>
  );
}

export default function LanguagePreferencePicker({
  selectedLanguages,
  onToggleLanguage,
  uiLocale,
  searchPlaceholder,
  sortLocaleLabel,
  sortAlphabeticalLabel,
  noResultsLabel,
  maxLanguages = MAX_STT_LANGUAGE_SELECTION,
  minLanguages = 1,
  disabled = false,
}: LanguagePreferencePickerProps) {
  const headingId = useId();
  const languageLocaleInfo = useMemo(() => resolveLanguageSelectorLocale(uiLocale), [uiLocale]);
  const defaultLanguageSortMode = useMemo(
    () => resolveDefaultLanguageSelectorSortMode(languageLocaleInfo.source),
    [languageLocaleInfo.source],
  );
  const showSortToggle = useMemo(
    () => resolveLanguageSelectorShowsSortToggle(languageLocaleInfo.locale),
    [languageLocaleInfo.locale],
  );
  const languageItems = useMemo(
    () => buildLanguageSelectorItems(languageLocaleInfo.locale),
    [languageLocaleInfo.locale],
  );
  const featuredLanguageItems = useMemo(
    () => buildLanguageSelectorFeaturedItems(languageItems),
    [languageItems],
  );
  const normalizedSelectedLanguages = useMemo(
    () => sanitizeSttLanguageSelection(selectedLanguages).slice(0, maxLanguages),
    [maxLanguages, selectedLanguages],
  );
  const selectedLanguageSet = useMemo(
    () => new Set(normalizedSelectedLanguages),
    [normalizedSelectedLanguages],
  );
  const [languageQuery, setLanguageQuery] = useState("");
  const [languageSortMode, setLanguageSortMode] = useState<LanguageSelectorSortMode>(defaultLanguageSortMode);
  const languageSectionCopy = useMemo(
    () => resolveLanguageSelectorSectionCopy(uiLocale),
    [uiLocale],
  );
  const visibleFeaturedLanguageItems = useMemo(
    () => filterLanguageSelectorItems(featuredLanguageItems, languageQuery),
    [featuredLanguageItems, languageQuery],
  );
  const visibleLanguageItems = useMemo(() => {
    const filteredItems = filterLanguageSelectorItems(languageItems, languageQuery);
    return sortLanguageSelectorItems(filteredItems, languageSortMode, languageLocaleInfo.locale);
  }, [languageItems, languageLocaleInfo.locale, languageQuery, languageSortMode]);

  useEffect(() => {
    setLanguageSortMode(defaultLanguageSortMode);
  }, [defaultLanguageSortMode]);

  const handleToggle = (code: SttLanguageCode) => {
    const selected = selectedLanguageSet.has(code);
    if (!selected && (disabled || normalizedSelectedLanguages.length >= maxLanguages)) return;
    if (selected && normalizedSelectedLanguages.length <= minLanguages) return;
    onToggleLanguage(code);
  };

  return (
    <div className="min-w-0 w-full max-w-full space-y-3">
      <div
        className="flex min-h-14 items-center gap-2 overflow-x-auto rounded-[18px] border border-gray-200 bg-white px-3 py-2 shadow-sm"
        aria-labelledby={headingId}
      >
        <span id={headingId} className="sr-only">Selected languages</span>
        {normalizedSelectedLanguages.map((code) => {
          const languageName = getSttLanguageDisplayName(code, uiLocale) || code;
          const canRemove = normalizedSelectedLanguages.length > minLanguages && !disabled;
          return (
            <button
              key={code}
              type="button"
              onClick={() => handleToggle(code)}
              disabled={!canRemove}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-amber-400 bg-white text-[2rem] leading-none shadow-[0_14px_28px_rgba(245,158,11,0.14)] transition active:scale-95 disabled:cursor-default"
              aria-label={canRemove ? `${languageName}: remove` : languageName}
              title={languageName}
            >
              <LanguageFlag language={code} className="text-[2rem] leading-none" />
            </button>
          );
        })}
      </div>

      <div className="min-w-0 w-full max-w-full overflow-hidden rounded-[18px] border border-gray-200 bg-white p-1 shadow-sm">
        <div className="flex min-w-0 w-full max-w-full items-stretch gap-3 p-2">
          <label
            className="flex h-12 min-w-0 items-center gap-2.5 rounded-[16px] border border-gray-200 bg-white px-3.5 shadow-sm"
            style={{ flex: showSortToggle ? "1 1 0" : "1 1 100%" }}
          >
            <Search size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={languageQuery}
              onChange={(event) => setLanguageQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-slate-400"
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={disabled}
            />
          </label>

          {showSortToggle ? (
            <div className="min-w-0 rounded-[16px] border border-gray-200 bg-gray-50 p-1" style={{ flex: "1 1 0" }}>
              <div className="flex h-full items-stretch gap-1.5">
                <button
                  type="button"
                  onClick={() => setLanguageSortMode("locale")}
                  className={`min-w-0 flex-1 truncate rounded-[12px] px-2 text-[0.8rem] font-semibold transition sm:text-[0.84rem] ${languageSortMode === "locale" ? "bg-white text-slate-950 shadow-[0_10px_20px_rgba(15,23,42,0.08)]" : "text-slate-500 hover:text-slate-900"}`}
                  aria-pressed={languageSortMode === "locale"}
                  disabled={disabled}
                >
                  {sortLocaleLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setLanguageSortMode("alphabetical")}
                  className={`min-w-0 flex-1 truncate rounded-[12px] px-2 text-[0.8rem] font-semibold transition sm:text-[0.84rem] ${languageSortMode === "alphabetical" ? "bg-white text-slate-950 shadow-[0_10px_20px_rgba(15,23,42,0.08)]" : "text-slate-500 hover:text-slate-900"}`}
                  aria-pressed={languageSortMode === "alphabetical"}
                  disabled={disabled}
                >
                  {sortAlphabeticalLabel}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="min-w-0 w-full max-w-full space-y-4 px-2 pb-2">
          {visibleFeaturedLanguageItems.length > 0 ? (
            <section aria-labelledby={`${headingId}-featured`} className="space-y-2">
              <h3 id={`${headingId}-featured`} className="px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                {languageSectionCopy.featured}
              </h3>
              <div className="space-y-2">
                {visibleFeaturedLanguageItems.map((option) => {
                  const selected = selectedLanguageSet.has(option.code);
                  return (
                    <LanguageOptionButton
                      key={`featured-${option.code}`}
                      option={option}
                      selected={selected}
                      disabled={disabled || (!selected && normalizedSelectedLanguages.length >= maxLanguages)}
                      onSelect={handleToggle}
                    />
                  );
                })}
              </div>
            </section>
          ) : null}

          <section aria-labelledby={`${headingId}-all`} className="space-y-2">
            <h3 id={`${headingId}-all`} className="px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
              {languageSectionCopy.all}
            </h3>
            {visibleLanguageItems.length === 0 ? (
              <div className="flex min-h-[160px] items-center justify-center px-6 text-center text-[13px] text-slate-500">
                {noResultsLabel}
              </div>
            ) : (
              <div className="space-y-2">
                {visibleLanguageItems.map((option) => {
                  const selected = selectedLanguageSet.has(option.code);
                  return (
                    <LanguageOptionButton
                      key={`all-${option.code}`}
                      option={option}
                      selected={selected}
                      disabled={disabled || (!selected && normalizedSelectedLanguages.length >= maxLanguages)}
                      onSelect={handleToggle}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
