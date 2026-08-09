"use client";

import { Check, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useState } from "react";
import {
  buildLanguageSelectorItems,
  filterLanguageSelectorItems,
  resolveLanguageSelectorLocale,
  sortLanguageSelectorItems,
} from "@/components/LivePhoneDemo/language-selector.logic";
import { LANGUAGE_ONBOARDING_MAX_TARGET_LANGUAGES } from "@/components/LivePhoneDemo/language-onboarding.logic";
import type { LanguageOnboardingCopy } from "@/components/LivePhoneDemo/language-onboarding-copy";

type LanguageOnboardingTab = "source" | "target";

interface LanguageOnboardingModalProps {
  onClose: () => void;
  initialSourceLanguage: string;
  initialTargetLanguages: string[];
  uiLocale?: string;
  copy: LanguageOnboardingCopy;
  onConfirm: (sourceLanguage: string, targetLanguages: string[]) => void;
}

// Rendered only while the picker is open (see LivePhoneDemo.tsx), so mount-time
// state initializers below always pick up the latest defaults with no reset effect.
export default function LanguageOnboardingModal({
  onClose,
  initialSourceLanguage,
  initialTargetLanguages,
  uiLocale,
  copy,
  onConfirm,
}: LanguageOnboardingModalProps) {
  const titleId = useId();
  const [activeTab, setActiveTab] = useState<LanguageOnboardingTab>("source");
  const [query, setQuery] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState(initialSourceLanguage);
  const [targetLanguages, setTargetLanguages] = useState<string[]>(initialTargetLanguages);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const localeInfo = useMemo(() => resolveLanguageSelectorLocale(uiLocale), [uiLocale]);
  const languageItems = useMemo(
    () => buildLanguageSelectorItems(localeInfo.locale),
    [localeInfo.locale],
  );
  const filteredItems = useMemo(() => {
    const visibleItems = filterLanguageSelectorItems(languageItems, query);
    return sortLanguageSelectorItems(visibleItems, "locale", localeInfo.locale);
  }, [languageItems, localeInfo.locale, query]);

  if (typeof document === "undefined") return null;

  const atTargetMax = targetLanguages.length >= LANGUAGE_ONBOARDING_MAX_TARGET_LANGUAGES;

  const handleTabChange = (tab: LanguageOnboardingTab) => {
    setActiveTab(tab);
    setQuery("");
  };

  const handleRowClick = (code: string) => {
    if (activeTab === "source") {
      setSourceLanguage(code);
      return;
    }

    setTargetLanguages((current) => {
      if (current.includes(code)) {
        return current.filter((item) => item !== code);
      }
      if (current.length >= LANGUAGE_ONBOARDING_MAX_TARGET_LANGUAGES) return current;
      return [...current, code];
    });
  };

  const handleConfirm = () => {
    const sanitizedTargets = targetLanguages.length > 0 ? targetLanguages : [sourceLanguage];
    onConfirm(sourceLanguage, sanitizedTargets);
  };

  const overlay = (
    <div
      className="fixed inset-0 bg-[rgba(248,245,239,0.94)] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{ zIndex: 150 }}
    >
      <div
        className="mx-auto flex h-full w-full max-w-[540px] flex-col bg-[#fcfbf8] text-slate-950 shadow-[0_32px_80px_rgba(15,23,42,0.16)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-gray-100 bg-[#fcfbf8]">
          <div aria-hidden="true" style={{ height: "env(safe-area-inset-top, 0px)" }} />
          <div className="relative flex h-14 items-center justify-between gap-3 px-4">
            <span className="h-[38px] w-[40px] shrink-0" aria-hidden="true" />
            <p
              id={titleId}
              className="pointer-events-none absolute left-1/2 top-1/2 w-[calc(100%-88px)] -translate-x-1/2 -translate-y-1/2 truncate text-center text-[1rem] font-semibold tracking-[-0.02em] text-slate-950"
            >
              {copy.title}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-[38px] min-w-[40px] shrink-0 items-center justify-center px-1 text-gray-700 transition-colors hover:text-gray-900 active:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              aria-label={copy.closeLabel}
            >
              <X size={20} strokeWidth={2.4} />
            </button>
          </div>

          <div className="space-y-3 px-4 pb-3 pt-1">
            <div className="flex gap-2 rounded-[16px] border border-[#e6dfd2] bg-[#f3eee4] p-1">
              <button
                type="button"
                onClick={() => handleTabChange("source")}
                aria-pressed={activeTab === "source"}
                className={`flex-1 truncate rounded-[12px] px-3 py-2 text-[0.85rem] font-semibold transition ${
                  activeTab === "source"
                    ? "bg-white text-slate-950 shadow-[0_10px_20px_rgba(15,23,42,0.08)]"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {copy.sourceSectionLabel}
              </button>
              <button
                type="button"
                onClick={() => handleTabChange("target")}
                aria-pressed={activeTab === "target"}
                className={`flex-1 truncate rounded-[12px] px-3 py-2 text-[0.85rem] font-semibold transition ${
                  activeTab === "target"
                    ? "bg-white text-slate-950 shadow-[0_10px_20px_rgba(15,23,42,0.08)]"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {copy.targetSectionLabel}
              </button>
            </div>

            <p className="text-[0.82rem] leading-snug text-slate-500">
              {activeTab === "source" ? copy.sourceDescriptionLabel : copy.targetDescriptionLabel}
            </p>

            <div className="flex h-12 min-w-0 items-center gap-2.5 rounded-[16px] border border-[#e6dfd2] bg-white px-3.5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <Search size={18} className="shrink-0 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-slate-400"
                enterKeyHint="search"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            {activeTab === "target" && atTargetMax ? (
              <p className="text-[0.78rem] font-medium text-amber-600">
                {copy.maxTargetLanguagesReachedLabel}
              </p>
            ) : null}
          </div>
        </header>

        <div
          className="flex-1 overflow-y-auto px-4"
          style={{ paddingBottom: "max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px))" }}
        >
          {filteredItems.length === 0 ? (
            <div className="flex h-full min-h-[240px] items-center justify-center px-6 text-center text-sm text-slate-500">
              {copy.noResultsLabel}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2 py-3">
              {filteredItems.map((lang) => {
                const isSelected = activeTab === "source"
                  ? sourceLanguage === lang.code
                  : targetLanguages.includes(lang.code);
                const isDisabled = activeTab === "target" && !isSelected && atTargetMax;

                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => handleRowClick(lang.code)}
                    disabled={isDisabled}
                    aria-pressed={isSelected}
                    aria-label={`${lang.localizedName} · ${lang.secondaryLabel}`}
                    title={`${lang.localizedName} · ${lang.secondaryLabel}`}
                    className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[1rem] border transition ${
                      isSelected
                        ? "border-amber-400 bg-amber-50/95 shadow-[0_10px_20px_rgba(245,158,11,0.14)]"
                        : "border-[#ece6db] bg-white shadow-[0_6px_16px_rgba(15,23,42,0.04)]"
                    } ${
                      isDisabled
                        ? "cursor-not-allowed opacity-45"
                        : "hover:-translate-y-[1px] hover:shadow-[0_12px_24px_rgba(15,23,42,0.08)]"
                    }`}
                  >
                    {isSelected ? (
                      <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white">
                        <Check size={10} strokeWidth={3.5} />
                      </span>
                    ) : null}
                    <span className="text-[3.5rem] leading-none">{lang.flag}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <footer
          className="shrink-0 border-t border-gray-100 bg-[#fcfbf8] px-4 pt-3"
          style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom, 0px))" }}
        >
          <p className="pb-3 text-center text-[0.78rem] text-slate-500">{copy.laterHintLabel}</p>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex h-12 w-full items-center justify-center rounded-full bg-amber-500 text-[0.95rem] font-semibold text-white shadow-[0_16px_32px_rgba(245,158,11,0.28)] transition hover:-translate-y-[1px] hover:bg-amber-600"
          >
            {copy.confirmButtonLabel}
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
