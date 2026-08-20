"use client";

import { Check, ChevronLeft, Loader2, Search, X } from "lucide-react";
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
import { resolveSignupCopy } from "@/i18n/signup-copy";
import LanguageFlag from "@/components/language-flag";
import SignupBirthDatePicker from "@/components/signup-birth-date-picker";
import {
  isOldEnoughForSignup,
  type BirthDateParts,
} from "@/lib/birth-date";
import {
  resolveDiscoverySourceCopy,
  type DiscoverySource,
} from "@/lib/discovery-source";

const DEFAULT_ONBOARDING_BIRTH_DATE: BirthDateParts = {
  year: 2000,
  month: 1,
  day: 1,
};

export type LanguageOnboardingConfirmPayload = {
  language: string;
  birthDate: BirthDateParts;
  discoverySource: DiscoverySource;
};

interface LanguageOnboardingModalProps {
  onClose?: () => void;
  dismissible?: boolean;
  initialLanguage: string;
  initialBirthDate?: BirthDateParts;
  uiLocale: string;
  onConfirm: (payload: LanguageOnboardingConfirmPayload) => void | Promise<void>;
}

type OnboardingStep = "language" | "birth-date" | "discovery-source";

// Rendered only while the picker is open (see LivePhoneDemo.tsx), so mount-time
// state initializers below always pick up the latest defaults with no reset effect.
export default function LanguageOnboardingModal({
  onClose,
  dismissible = true,
  initialLanguage,
  initialBirthDate = DEFAULT_ONBOARDING_BIRTH_DATE,
  uiLocale,
  onConfirm,
}: LanguageOnboardingModalProps) {
  const titleId = useId();
  const [step, setStep] = useState<OnboardingStep>("language");
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState(initialLanguage);
  const [birthDate, setBirthDate] = useState<BirthDateParts>(initialBirthDate);
  const [discoverySource, setDiscoverySource] = useState<DiscoverySource | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // The modal's own copy previews in whichever language is tentatively tapped
  // (not just the checkmark) so the picker itself demonstrates the effect of
  // the choice before the user commits to it.
  const copy = useMemo(() => resolveLanguageOnboardingCopy(language), [language]);
  const signupCopy = useMemo(() => resolveSignupCopy(language), [language]);
  const discoveryCopy = useMemo(() => resolveDiscoverySourceCopy(language), [language]);
  const isEligibleAge = useMemo(() => isOldEnoughForSignup(birthDate), [birthDate]);

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
      if (!dismissible || !onClose || event.key !== "Escape" || isConfirming) return;
      event.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismissible, isConfirming, onClose]);

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

  const handleLanguageStepNext = () => {
    setStep("birth-date");
  };

  const handleBirthDateStepNext = () => {
    if (!isEligibleAge) return;
    setStep("discovery-source");
  };

  const handleStepBack = () => {
    if (isConfirming) return;
    setStep((currentStep) => currentStep === "discovery-source" ? "birth-date" : "language");
  };

  const handleFinalConfirm = async () => {
    if (isConfirming || !isEligibleAge || !discoverySource) return;
    setIsConfirming(true);
    try {
      await onConfirm({ language, birthDate, discoverySource });
    } finally {
      setIsConfirming(false);
    }
  };

  // Row layout matches LanguageSelector.tsx (the in-room language picker) so the
  // two pickers read as the same UI: flag, localized name, secondary label, checkmark.
  const renderLanguageRow = (lang: LanguageSelectorItem) => {
    const isSelected = language === lang.code;

    return (
      <button
        key={lang.code}
        type="button"
        disabled={isConfirming}
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
          <LanguageFlag language={lang.code} className="translate-y-[0.12em] text-[2rem] leading-none" />
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
      // Portal to the document root so the picker remains above app overlays. The
      // first-entry flow also withholds the authentication surface until this picker
      // is complete, so the language choice is never presented as a late cover layer.
      style={{ zIndex: 250 }}
    >
      <div
        className="mx-auto flex h-full w-full max-w-[540px] flex-col bg-[#fcfbf8] text-slate-950 shadow-[0_32px_80px_rgba(15,23,42,0.16)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-gray-100 bg-[#fcfbf8]">
          <div aria-hidden="true" style={{ height: "env(safe-area-inset-top, 0px)" }} />
          <div className="flex h-12 items-center justify-between px-2">
            {step !== "language" ? (
              <button
                type="button"
                onClick={handleStepBack}
                disabled={isConfirming}
                className="inline-flex h-[38px] min-w-[40px] shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={signupCopy.backAction}
              >
                <ChevronLeft size={24} strokeWidth={2.4} />
              </button>
            ) : (
              <div className="w-10" />
            )}

            {dismissible && onClose ? (
              <button
                type="button"
                onClick={onClose}
                disabled={isConfirming}
                className="inline-flex h-[38px] min-w-[40px] shrink-0 items-center justify-center px-1 text-gray-700 transition-colors hover:text-gray-900 active:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-wait disabled:opacity-50"
                aria-label={copy.closeLabel}
              >
                <X size={20} strokeWidth={2.4} />
              </button>
            ) : (
              <div className="w-10" />
            )}
          </div>

          {step === "language" ? (
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
                  disabled={isConfirming}
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
          ) : step === "birth-date" ? (
            <div className="space-y-2 px-6 pb-4 pt-0 text-center">
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-amber-600">
                {signupCopy.birthDateStep}
              </p>
              <h2
                id={titleId}
                className="text-[1.4rem] font-bold leading-tight tracking-[-0.02em] text-slate-950"
              >
                {signupCopy.birthDateTitle}
              </h2>
              <p className="text-[0.85rem] leading-relaxed text-slate-500">
                {signupCopy.birthDateDescription}
              </p>
            </div>
          ) : (
            <div className="space-y-2 px-6 pb-4 pt-0 text-center">
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-amber-600">
                {discoveryCopy.step}
              </p>
              <h2
                id={titleId}
                className="text-[1.4rem] font-bold leading-tight tracking-[-0.02em] text-slate-950"
              >
                {discoveryCopy.title}
              </h2>
              <p className="text-[0.85rem] leading-relaxed text-slate-500">
                {discoveryCopy.description}
              </p>
            </div>
          )}
        </header>

        {step === "language" ? (
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
        ) : step === "birth-date" ? (
          <div
            className="flex flex-1 flex-col justify-center overflow-y-auto px-6 py-4"
            style={{ paddingBottom: "max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px))" }}
          >
            <div className="mx-auto w-full max-w-sm">
              <SignupBirthDatePicker
                value={birthDate}
                onChange={setBirthDate}
                yearLabel={signupCopy.yearLabel}
                monthLabel={signupCopy.monthLabel}
                dayLabel={signupCopy.dayLabel}
              />

              <div
                className={`mt-6 rounded-2xl border px-4 py-3 text-center text-[0.86rem] leading-relaxed transition-colors ${
                  isEligibleAge
                    ? "border-amber-100 bg-amber-50/80 text-amber-900"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {isEligibleAge ? signupCopy.birthDateAgeHint : signupCopy.birthDateUnderage}
              </div>
            </div>
          </div>
        ) : (
          <div
            className="flex flex-1 flex-col overflow-y-auto px-5 py-5"
            style={{ paddingBottom: "max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px))" }}
          >
            <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
              {discoveryCopy.options.map((option) => {
                const isSelected = discoverySource === option.code;
                return (
                  <button
                    key={option.code}
                    type="button"
                    disabled={isConfirming}
                    onClick={() => setDiscoverySource(option.code)}
                    aria-pressed={isSelected}
                    className={`flex min-h-[62px] w-full items-center gap-3 rounded-[1.35rem] border px-4 text-left transition hover:-translate-y-[1px] hover:shadow-[0_18px_36px_rgba(15,23,42,0.08)] ${
                      isSelected
                        ? "border-amber-400 bg-amber-50/95 shadow-[0_16px_32px_rgba(245,158,11,0.12)]"
                        : "border-[#ece6db] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.05)]"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${
                        isSelected
                          ? "border-amber-500 bg-amber-500 text-white"
                          : "border-slate-300 bg-white text-transparent"
                      }`}
                    >
                      <Check size={16} strokeWidth={3.2} />
                    </span>
                    <span className="min-w-0 flex-1 text-[0.98rem] font-semibold leading-snug text-slate-900">
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <footer
          className="shrink-0 border-t border-gray-100 bg-[#fcfbf8] px-4 pt-3"
          style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom, 0px))" }}
        >
          {step === "language" ? (
            <>
              <p className="pb-3 text-center text-[0.78rem] text-slate-500">{copy.laterHintLabel}</p>
              <button
                type="button"
                onClick={handleLanguageStepNext}
                disabled={isConfirming}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-amber-500 text-[0.95rem] font-semibold text-white shadow-[0_16px_32px_rgba(245,158,11,0.28)] transition hover:-translate-y-[1px] hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {signupCopy.continueAction}
              </button>
            </>
          ) : step === "birth-date" ? (
            <button
              type="button"
              onClick={handleBirthDateStepNext}
              disabled={isConfirming || !isEligibleAge}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-amber-500 text-[0.95rem] font-semibold text-white shadow-[0_16px_32px_rgba(245,158,11,0.28)] transition hover:-translate-y-[1px] hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:opacity-70 disabled:shadow-none"
            >
              {signupCopy.continueAction}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinalConfirm}
              disabled={isConfirming || !discoverySource}
              aria-busy={isConfirming}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-amber-500 text-[0.95rem] font-semibold text-white shadow-[0_16px_32px_rgba(245,158,11,0.28)] transition hover:-translate-y-[1px] hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:opacity-70 disabled:shadow-none"
            >
              {isConfirming ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
              {copy.confirmButtonLabel}
            </button>
          )}
        </footer>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
