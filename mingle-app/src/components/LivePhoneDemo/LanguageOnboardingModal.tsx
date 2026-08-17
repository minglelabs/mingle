"use client";

import { Check, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useState } from "react";
import {
  buildLanguageSelectorItems,
  filterLanguageSelectorItems,
  partitionLanguageSelectorItemsByPriority,
  sortLanguageSelectorItems,
  type LanguageSelectorItem,
} from "@/components/LivePhoneDemo/language-selector.logic";
import { resolveLanguageOnboardingCopy } from "@/components/LivePhoneDemo/language-onboarding-copy";

interface LanguageOnboardingModalProps {
  onClose: () => void;
  initialLanguage: string;
  uiLocale: string;
  onConfirm: (language: string) => void;
}

// Rendered only while the picker is open (see LivePhoneDemo.tsx), so mount-time
// state initializers below always pick up the latest defaults with no reset effect.
export default function LanguageOnboardingModal({
  onClose,
  initialLanguage,
  uiLocale,
  onConfirm,
}: LanguageOnboardingModalProps) {
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState(initialLanguage);

  // The modal's own copy previews in whichever language is tentatively tapped
  // (not just the checkmark) so the picker itself demonstrates the effect of
  // the choice before the user commits to it.
  const copy = useMemo(() => resolveLanguageOnboardingCopy(language), [language]);

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

  // The list stays in the app's current ui locale regardless of which output
  // language is tentatively selected -- unlike the old "my language" step, this
  // selection doesn't represent a language the user necessarily reads, so
  // re-localizing the list to match it would strand them mid-browse.
  const languageItems = useMemo(
    () => buildLanguageSelectorItems(uiLocale),
    [uiLocale],
  );
  const filteredItems = useMemo(() => {
    const visibleItems = filterLanguageSelectorItems(languageItems, query);
    return sortLanguageSelectorItems(visibleItems, "locale", uiLocale);
  }, [languageItems, uiLocale, query]);
  const { priorityItems, otherItems } = useMemo(
    () => partitionLanguageSelectorItemsByPriority(filteredItems),
    [filteredItems],
  );

  if (typeof document === "undefined") return null;

  const handleConfirm = () => {
    onConfirm(language);
  };

  // Row layout matches LanguageSelector.tsx (the in-room language picker) so the
  // two pickers read as the same UI: flag, localized name, secondary label, checkmark.
  const renderLanguageRow = (lang: LanguageSelectorItem) => {
    const isSelected = language === lang.code;

    return (
      <button
        key={lang.code}
        type="button"
        onClick={() => setLanguage(lang.code)}
        aria-pressed={isSelected}
        className={`flex w-full items-center gap-4 rounded-[1.6rem] border px-4 py-3 text-left transition ${
          isSelected
            ? "border-amber-400 bg-amber-50/95 shadow-[0_16px_32px_rgba(245,158,11,0.12)]"
            : "border-[#ece6db] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.05)]"
        } hover:-translate-y-[1px] hover:shadow-[0_18px_36px_rgba(15,23,42,0.08)]`}
      >
        <span
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border shadow-sm ${
            isSelected
              ? "border-amber-300 bg-white shadow-[0_6px_14px_rgba(245,158,11,0.08)]"
              : "border-[#e5dfd5] bg-[#faf7f1]"
          }`}
        >
          <span className="translate-y-[0.12em] text-[2rem] leading-none">{lang.flag}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[1rem] font-semibold tracking-[-0.01em] text-slate-950">
            {lang.localizedName}
          </span>
          <span className="mt-0.5 block truncate text-[0.9rem] text-slate-500">
            {lang.secondaryLabel}
          </span>
        </span>
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
            isSelected
              ? "border-amber-500 bg-amber-500 text-white"
              : "border-slate-300 text-transparent"
          }`}
        >
          <Check size={14} strokeWidth={3.2} />
        </span>
      </button>
    );
  };

  const overlay = (
    <div
      className="fixed inset-0 bg-[rgba(248,245,239,0.94)] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      // Sits above the conversation list's unauthenticated auth overlay (z-200) so the
      // language choice is made before sign-up, not hidden behind it. Both live in the
      // root stacking context -- this modal portals to <body>, and the auth overlay's
      // parent <main> is position:relative with z-index:auto -- so they compare directly.
      style={{ zIndex: 250 }}
    >
      <div
        className="mx-auto flex h-full w-full max-w-[540px] flex-col bg-[#fcfbf8] text-slate-950 shadow-[0_32px_80px_rgba(15,23,42,0.16)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-gray-100 bg-[#fcfbf8]">
          <div aria-hidden="true" style={{ height: "env(safe-area-inset-top, 0px)" }} />
          <div className="flex h-12 items-center justify-end px-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-[38px] min-w-[40px] shrink-0 items-center justify-center px-1 text-gray-700 transition-colors hover:text-gray-900 active:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              aria-label={copy.closeLabel}
            >
              <X size={20} strokeWidth={2.4} />
            </button>
          </div>

          <div className="space-y-4 px-4 pb-4 pt-0">
            <div className="space-y-1.5 text-center">
              <p
                id={titleId}
                className="text-[1.3rem] font-bold leading-tight tracking-[-0.02em] text-slate-950"
              >
                {copy.title}
              </p>
              <p className="text-[0.82rem] leading-snug text-slate-500">{copy.descriptionLabel}</p>
            </div>

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
            <div className="space-y-5 py-4">
              {priorityItems.length > 0 ? (
                <div className="space-y-3">
                  <p className="px-1 text-[0.78rem] font-semibold uppercase tracking-wide text-slate-400">
                    {copy.priorityLanguagesLabel}
                  </p>
                  <div className="space-y-3">
                    {priorityItems.map((lang) => renderLanguageRow(lang))}
                  </div>
                </div>
              ) : null}

              {otherItems.length > 0 ? (
                <div className="space-y-3">
                  {priorityItems.length > 0 ? (
                    <p className="px-1 text-[0.78rem] font-semibold uppercase tracking-wide text-slate-400">
                      {copy.allLanguagesLabel}
                    </p>
                  ) : null}
                  <div className="space-y-3">
                    {otherItems.map((lang) => renderLanguageRow(lang))}
                  </div>
                </div>
              ) : null}
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
