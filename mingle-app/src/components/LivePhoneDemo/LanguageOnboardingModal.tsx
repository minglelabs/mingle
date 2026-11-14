"use client";

import { Check, ChevronLeft, Loader2, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type TouchEvent as ReactTouchEvent } from "react";
import { registerNativeEdgeSwipeSuppression } from "@/components/slide-surface";
import { isLeftEdgeSwipeBack, isLeftEdgeSwipeStart } from "@/lib/edge-swipe";
import {
  buildLanguageSelectorItems,
  buildLanguageSelectorItemsForDisplayLocale,
  filterLanguageSelectorItems,
  partitionLanguageSelectorItemsByPriority,
  sortLanguageSelectorItems,
  type LanguageSelectorItem,
} from "@/components/LivePhoneDemo/language-selector.logic";
import { resolveUiLocaleForLanguage } from "@/components/LivePhoneDemo/language-onboarding.logic";
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
  shuffleDiscoverySourceCodes,
  type DiscoverySource,
} from "@/lib/discovery-source";
import { registerNativeBackHandler } from "@/lib/native-back-handler";
import {
  USAGE_PURPOSE_NOTE_MAX_LENGTH,
  normalizeUsagePurposeNote,
  resolveUsagePurposeCopy,
  type UsagePurpose,
} from "@/lib/usage-purpose";
import { useNativeBannerSuppression } from "@/lib/use-native-banner-suppression";
import { canonicalizeSttLanguageCode } from "@/lib/stt-languages";
import type { InterestLanguage } from "@/lib/interest-languages";
import { resolveInterestLanguageCopy } from "@/i18n/interest-language-copy";
import LanguageLevelPicker from "@/components/language-level-picker";
import ProfileGenderPicker from "@/components/profile-gender-picker";
import { resolveProfileGenderCopy } from "@/i18n/profile-gender-copy";
import type { ProfileGender } from "@/lib/profile-gender";

const DEFAULT_ONBOARDING_BIRTH_DATE: BirthDateParts = {
  year: 2000,
  month: 1,
  day: 1,
};

/**
 * What the screens collected. A field is null when its step was not among the
 * `steps` shown: the first run asks only for the language, and the other
 * questions come later, each when it is needed.
 */
export type LanguageOnboardingConfirmPayload = {
  language: string;
  /** 관심 언어: the language of the people the user mostly wants to talk with. */
  interestLanguage: InterestLanguage | null;
  birthDate: BirthDateParts | null;
  gender: ProfileGender | null;
  usagePurpose: UsagePurpose | null;
  /** Optional free-text reason, only for "other". */
  usagePurposeNote: string | null;
  discoverySource: DiscoverySource | null;
};

interface LanguageOnboardingModalProps {
  onClose?: () => void;
  dismissible?: boolean;
  initialLanguage: string;
  initialBirthDate?: BirthDateParts;
  uiLocale: string;
  /**
   * The screens to show, in order. Defaults to the language alone (the first
   * run). Later questions reuse this modal with their own steps, e.g.
   * `["discovery-source"]` or `["gender", "birth-date"]`.
   */
  steps?: readonly OnboardingStep[];
  /**
   * The person came through a friend's invite ticket: only the language and
   * the birth date (age check) are asked, whatever `steps` says. The purpose
   * is set to "social" and the discovery source to "friend".
   */
  invite?: boolean;
  onConfirm: (payload: LanguageOnboardingConfirmPayload) => void | Promise<void>;
}

export type OnboardingStep = "language" | "interest-language" | "usage-purpose" | "discovery-source" | "gender" | "birth-date";

export const FIRST_RUN_ONBOARDING_STEPS: readonly OnboardingStep[] = ["language"];
export const INVITE_ONBOARDING_STEPS: readonly OnboardingStep[] = ["language", "birth-date"];

// Long enough to see the tapped gender light up before the next screen slides in.
const GENDER_AUTO_ADVANCE_MS = 220;

// Rendered only while the picker is open (see LivePhoneDemo.tsx), so mount-time
// state initializers below always pick up the latest defaults with no reset effect.
export default function LanguageOnboardingModal({
  onClose,
  dismissible = true,
  initialLanguage,
  initialBirthDate = DEFAULT_ONBOARDING_BIRTH_DATE,
  uiLocale,
  steps: requestedSteps = FIRST_RUN_ONBOARDING_STEPS,
  invite = false,
  onConfirm,
}: LanguageOnboardingModalProps) {
  const steps = invite ? INVITE_ONBOARDING_STEPS : requestedSteps;
  // Mounted only while onboarding is on screen: no native ad banner at any
  // step, whatever zone the screen underneath asked for.
  useNativeBannerSuppression();
  const titleId = useId();
  const firstStep = steps[0] ?? "language";
  const [step, setStep] = useState<OnboardingStep>(firstStep);
  const stepIndex = Math.max(0, steps.indexOf(step));
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex >= steps.length - 1;
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState(initialLanguage);
  const [interestQuery, setInterestQuery] = useState("");
  const [interestCode, setInterestCode] = useState<string | null>(null);
  const [interestLevel, setInterestLevel] = useState(1);
  const [birthDate, setBirthDate] = useState<BirthDateParts>(initialBirthDate);
  const [gender, setGender] = useState<ProfileGender | null>(null);
  const [usagePurpose, setUsagePurpose] = useState<UsagePurpose | null>(null);
  const [usagePurposeNote, setUsagePurposeNote] = useState("");
  const [discoverySource, setDiscoverySource] = useState<DiscoverySource | null>(null);
  const [discoveryOptionCodes, setDiscoveryOptionCodes] = useState(shuffleDiscoverySourceCodes);
  const [isConfirming, setIsConfirming] = useState(false);

  // The modal's own copy previews in whichever language is tentatively tapped
  // (not just the checkmark) so the picker itself demonstrates the effect of
  // the choice before the user commits to it.
  const copy = useMemo(() => resolveLanguageOnboardingCopy(language), [language]);
  const signupCopy = useMemo(() => resolveSignupCopy(language), [language]);
  const discoveryCopy = useMemo(() => resolveDiscoverySourceCopy(language), [language]);
  const usagePurposeCopy = useMemo(() => resolveUsagePurposeCopy(language), [language]);
  const interestCopy = useMemo(() => resolveInterestLanguageCopy(language), [language]);
  const genderCopy = useMemo(() => resolveProfileGenderCopy(language), [language]);
  const discoveryOptions = useMemo(() => {
    const optionsByCode = new Map(discoveryCopy.options.map((option) => [option.code, option]));
    return discoveryOptionCodes
      .map((code) => optionsByCode.get(code))
      .filter((option): option is (typeof discoveryCopy.options)[number] => Boolean(option));
  }, [discoveryCopy, discoveryOptionCodes]);
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

  useEffect(() => {
    setDiscoveryOptionCodes(shuffleDiscoverySourceCodes());
  }, []);

  // Language names follow the modal copy (the tentatively selected language),
  // so one screen never mixes languages ("Speaks English", not "Speaks 영어").
  // The order stays sorted by the app's ui-locale names and search still
  // matches those names, so tapping a language does not reshuffle the list
  // under the user's finger or strand them mid-browse.
  const nameLocale = resolveUiLocaleForLanguage(language);
  const languageItems = useMemo(
    () => buildLanguageSelectorItemsForDisplayLocale(nameLocale, uiLocale),
    [nameLocale, uiLocale],
  );
  const browseOrder = useMemo(() => new Map(
    sortLanguageSelectorItems(buildLanguageSelectorItems(uiLocale), "locale", uiLocale)
      .map((item, index) => [item.code, index]),
  ), [uiLocale]);
  const sortByBrowseOrder = useCallback(
    (items: LanguageSelectorItem[]) => [...items].sort(
      (left, right) => (browseOrder.get(left.code) ?? 0) - (browseOrder.get(right.code) ?? 0),
    ),
    [browseOrder],
  );
  const filteredItems = useMemo(
    () => sortByBrowseOrder(filterLanguageSelectorItems(languageItems, query)),
    [languageItems, query, sortByBrowseOrder],
  );
  const { priorityItems, otherItems } = useMemo(
    () => partitionLanguageSelectorItemsByPriority(filteredItems),
    [filteredItems],
  );
  // The 관심 언어 list leaves out the language just chosen as the user's own.
  const ownLanguageCode = canonicalizeSttLanguageCode(language);
  const ownLanguageItem = useMemo(
    () => languageItems.find((item) => canonicalizeSttLanguageCode(item.code) === ownLanguageCode) ?? null,
    [languageItems, ownLanguageCode],
  );
  const interestItems = useMemo(() => {
    const visibleItems = filterLanguageSelectorItems(languageItems, interestQuery)
      .filter((item) => canonicalizeSttLanguageCode(item.code) !== ownLanguageCode);
    return partitionLanguageSelectorItemsByPriority(sortByBrowseOrder(visibleItems));
  }, [interestQuery, languageItems, ownLanguageCode, sortByBrowseOrder]);

  const handleStepBack = useCallback(() => {
    if (isConfirming) return;
    setStep((currentStep) => steps[Math.max(0, steps.indexOf(currentStep) - 1)] ?? firstStep);
  }, [firstStep, isConfirming, steps]);

  useEffect(() => registerNativeBackHandler(() => {
    if (isConfirming) return true;
    if (isFirstStep) return true;
    handleStepBack();
    return true;
  }, 30), [handleStepBack, isConfirming, isFirstStep]);

  // The native WKWebView edge-swipe would navigate the page underneath, so the
  // modal owns the gesture and maps it to the same step-back as the chevron.
  useEffect(() => registerNativeEdgeSwipeSuppression(), []);

  // Keep the opened level question visible when the tapped row sits near the
  // bottom of the list.
  useEffect(() => {
    if (step !== "interest-language" || !interestCode) return;
    const frame = window.requestAnimationFrame(() => {
      const row = document.querySelector(`[data-onboarding-expandable-row="${CSS.escape(interestCode)}"]`);
      row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [interestCode, step]);

  const genderAdvanceTimerRef = useRef<number | null>(null);
  const clearGenderAdvance = useCallback(() => {
    if (genderAdvanceTimerRef.current === null) return;
    window.clearTimeout(genderAdvanceTimerRef.current);
    genderAdvanceTimerRef.current = null;
  }, []);
  // Leaving the gender screen any other way (back gesture) cancels a pending advance.
  useEffect(() => {
    if (step !== "gender") clearGenderAdvance();
  }, [clearGenderAdvance, step]);
  useEffect(() => clearGenderAdvance, [clearGenderAdvance]);

  const edgeSwipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleEdgeSwipeStart = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    const touch = event.touches.length === 1 ? event.touches[0] : null;
    edgeSwipeStartRef.current = touch && isLeftEdgeSwipeStart(touch.clientX)
      ? { x: touch.clientX, y: touch.clientY }
      : null;
  }, []);

  const handleEdgeSwipeEnd = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    const start = edgeSwipeStartRef.current;
    edgeSwipeStartRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch || isFirstStep) return;
    if (isLeftEdgeSwipeBack(start, { x: touch.clientX, y: touch.clientY }, window.innerWidth)) {
      handleStepBack();
    }
  }, [handleStepBack, isFirstStep]);

  const handleEdgeSwipeCancel = useCallback(() => {
    edgeSwipeStartRef.current = null;
  }, []);

  if (typeof document === "undefined") return null;

  const isStepAnswered = (target: OnboardingStep): boolean => (
    target === "language" ? true
      : target === "interest-language" ? Boolean(interestCode)
      : target === "usage-purpose" ? Boolean(usagePurpose)
      : target === "discovery-source" ? Boolean(discoverySource)
      : target === "gender" ? Boolean(gender)
        : isEligibleAge
  );

  const handleFinalConfirm = async () => {
    if (isConfirming || !steps.every(isStepAnswered)) return;
    const asked = (target: OnboardingStep) => steps.includes(target);
    setIsConfirming(true);
    try {
      await onConfirm({
        language,
        interestLanguage: asked("interest-language") && interestCode
          ? { code: interestCode as InterestLanguage["code"], level: interestLevel }
          : null,
        birthDate: asked("birth-date") ? birthDate : null,
        gender: asked("gender") ? gender : null,
        usagePurpose: invite ? "social" : asked("usage-purpose") ? usagePurpose : null,
        usagePurposeNote: asked("usage-purpose") && usagePurpose === "other"
          ? normalizeUsagePurposeNote(usagePurposeNote)
          : null,
        discoverySource: invite ? "friend" : asked("discovery-source") ? discoverySource : null,
      });
    } finally {
      setIsConfirming(false);
    }
  };

  // The footer button: on to the next screen, or finish on the last one.
  const handleStepNext = () => {
    if (isConfirming || !isStepAnswered(step)) return;
    if (step === "language" && interestCode && canonicalizeSttLanguageCode(interestCode) === ownLanguageCode) {
      setInterestCode(null);
    }
    if (step === "gender") clearGenderAdvance();
    if (isLastStep) {
      void handleFinalConfirm();
      return;
    }
    setStep(steps[stepIndex + 1]);
  };

  // One tap picks the gender and moves on; the footer button stays for
  // someone who came back to this screen and keeps the same answer.
  const handleGenderSelect = (nextGender: ProfileGender) => {
    if (isConfirming) return;
    setGender(nextGender);
    clearGenderAdvance();
    // The last screen waits for the footer button instead of finishing on a tap.
    if (isLastStep) return;
    genderAdvanceTimerRef.current = window.setTimeout(() => {
      genderAdvanceTimerRef.current = null;
      setStep(steps[stepIndex + 1]);
    }, GENDER_AUTO_ADVANCE_MS);
  };

  // Row layout matches LanguageSelector.tsx (the in-room language picker) so the
  // two pickers read as the same UI: flag, localized name, secondary label, checkmark.
  const renderLanguageRow = (
    lang: LanguageSelectorItem,
    selectedCode: string | null = language,
    onSelect: (code: string) => void = setLanguage,
    // Shown inside the selected row's card, directly under it, so a follow-up
    // question (the interest-language level) appears where the user just tapped.
    renderExpanded?: () => ReactNode,
  ) => {
    const isSelected = selectedCode === lang.code;
    const cardClassName = `rounded-[1.6rem] border transition ${
      isSelected
        ? "border-amber-400 bg-amber-50/95 shadow-[0_16px_32px_rgba(245,158,11,0.12)]"
        : "border-[#ece6db] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.05)]"
    }`;
    const isExpandable = Boolean(renderExpanded);

    const rowButton = (
      <button
        key={isExpandable ? undefined : lang.code}
        type="button"
        disabled={isConfirming}
        onClick={() => onSelect(lang.code)}
        aria-pressed={isSelected}
        aria-expanded={isExpandable ? isSelected : undefined}
        className={`flex w-full items-center gap-4 px-4 py-4 text-left ${
          isExpandable
            ? "rounded-[1.6rem]"
            : `${cardClassName} hover:-translate-y-[1px] hover:shadow-[0_18px_36px_rgba(15,23,42,0.08)]`
        }`}
      >
        <span
          className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full border shadow-sm ${
            isSelected
              ? "border-amber-300 bg-white shadow-[0_6px_14px_rgba(245,158,11,0.08)]"
              : "border-[#e5dfd5] bg-[#faf7f1]"
          }`}
        >
          <LanguageFlag language={lang.code} className="translate-y-[0.12em] text-[2.4rem] leading-none" />
        </span>
        <span className="min-w-0 flex-1">
          <span suppressHydrationWarning className="block truncate text-[1.3rem] font-bold tracking-[-0.01em] text-slate-950">
            {lang.localizedName}
          </span>
          <span suppressHydrationWarning data-qa-allow-truncate className="mt-0.5 block truncate text-[0.95rem] text-slate-500">
            {lang.secondaryLabel}
          </span>
        </span>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
            isSelected
              ? "border-amber-500 bg-amber-500 text-white"
              : "border-slate-300 text-transparent"
          }`}
        >
          <Check size={16} strokeWidth={3.2} />
        </span>
      </button>
    );

    if (!renderExpanded) return rowButton;

    return (
      <div key={lang.code} className={cardClassName} data-onboarding-expandable-row={lang.code}>
        {rowButton}
        {isSelected ? (
          <div className="mx-4 border-t border-amber-200/80 pb-5 pt-4">
            {renderExpanded()}
          </div>
        ) : null}
      </div>
    );
  };

  const renderInterestLevel = () => (
    <div className="flex flex-col items-center gap-3">
      <p className="text-center text-[1.25rem] font-bold tracking-[-0.01em] text-slate-950">
        {interestCopy.levelQuestion}
      </p>
      <LanguageLevelPicker
        level={interestLevel}
        locale={language}
        onChange={setInterestLevel}
        disabled={isConfirming}
        size="large"
      />
    </div>
  );

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
      onTouchStart={handleEdgeSwipeStart}
      onTouchEnd={handleEdgeSwipeEnd}
      onTouchCancel={handleEdgeSwipeCancel}
    >
      <div
        className="mx-auto flex h-full w-full max-w-[540px] flex-col bg-[#fcfbf8] text-slate-950 shadow-[0_32px_80px_rgba(15,23,42,0.16)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-gray-100 bg-[#fcfbf8]">
          <div aria-hidden="true" style={{ height: "env(safe-area-inset-top, 0px)" }} />
          <div className="flex h-12 items-center justify-between px-2">
            {!isFirstStep ? (
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
                <h2 id={titleId} className="space-y-1">
                  <span className="block text-[2.1rem] font-extrabold leading-tight tracking-[-0.03em] text-amber-600">
                    {copy.headline}
                  </span>
                  <span className="block text-[1.3rem] font-bold leading-snug tracking-[-0.02em] text-slate-950">
                    {copy.title}
                  </span>
                </h2>
                <p className="text-[0.95rem] leading-snug text-slate-500">{copy.descriptionLabel}</p>
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
          ) : step === "interest-language" ? (
            <div className="space-y-4 px-4 pb-4 pt-0">
              {/* Step 1 and this step are both language lists; the done chip and the
                  large 관심 언어 headline keep users from reading this as step 1 again. */}
              {ownLanguageItem ? (
                <div className="flex justify-center">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[0.85rem] text-slate-600">
                    <Check size={14} strokeWidth={3} className="text-emerald-500" aria-hidden />
                    <span>{interestCopy.primaryLabel}</span>
                    <LanguageFlag language={ownLanguageItem.code} className="text-[1rem] leading-none" />
                    <span className="font-semibold text-slate-800">{ownLanguageItem.localizedName}</span>
                  </span>
                </div>
              ) : null}
              <div className="space-y-1.5 text-center">
                <h2
                  id={titleId}
                  className="space-y-1"
                >
                  <span className="block text-[2.1rem] font-extrabold leading-tight tracking-[-0.03em] text-amber-600">
                    {interestCopy.onboardingStep}
                  </span>
                  <span className="block text-[1.3rem] font-bold leading-snug tracking-[-0.02em] text-slate-950">
                    {interestCopy.onboardingTitle}
                  </span>
                </h2>
                <p className="text-[0.95rem] leading-snug text-slate-500">{interestCopy.onboardingDescription}</p>
              </div>

              <div className="flex h-12 min-w-0 items-center gap-2.5 rounded-[16px] border border-[#e6dfd2] bg-white px-3.5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                <Search size={18} className="shrink-0 text-slate-400" />
                <input
                  type="search"
                  value={interestQuery}
                  disabled={isConfirming}
                  onChange={(event) => setInterestQuery(event.target.value)}
                  placeholder={copy.searchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-slate-400"
                  enterKeyHint="search"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            </div>
          ) : step === "gender" ? (
            <div className="space-y-2 px-6 pb-4 pt-0 text-center">
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-amber-600">
                {genderCopy.label}
              </p>
              <h2
                id={titleId}
                className="text-[1.4rem] font-bold leading-tight tracking-[-0.02em] text-slate-950"
              >
                {genderCopy.stepTitle}
              </h2>
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
          ) : step === "usage-purpose" ? (
            <div className="space-y-2 px-6 pb-4 pt-0 text-center">
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-amber-600">
                {usagePurposeCopy.step}
              </p>
              <h2
                id={titleId}
                className="text-[1.4rem] font-bold leading-tight tracking-[-0.02em] text-slate-950"
              >
                {usagePurposeCopy.title}
              </h2>
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
        ) : step === "interest-language" ? (
          <div
            className="flex-1 overflow-y-auto px-4"
            style={{ paddingBottom: "max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px))" }}
          >
            {interestItems.priorityItems.length + interestItems.otherItems.length === 0 ? (
              <div className="flex h-full min-h-[240px] items-center justify-center px-6 text-center text-sm text-slate-500">
                {copy.noResultsLabel}
              </div>
            ) : (
              <div className="space-y-5 py-4">
                {interestItems.priorityItems.length > 0 ? (
                  <div className="space-y-3">
                    <p className="px-1 text-[0.78rem] font-semibold uppercase tracking-wide text-slate-400">
                      {copy.priorityLanguagesLabel}
                    </p>
                    <div className="space-y-3">
                      {interestItems.priorityItems.map((lang) => renderLanguageRow(lang, interestCode, setInterestCode, renderInterestLevel))}
                    </div>
                  </div>
                ) : null}
                {interestItems.otherItems.length > 0 ? (
                  <div className="space-y-3">
                    {interestItems.priorityItems.length > 0 ? (
                      <p className="px-1 text-[0.78rem] font-semibold uppercase tracking-wide text-slate-400">
                        {copy.allLanguagesLabel}
                      </p>
                    ) : null}
                    <div className="space-y-3">
                      {interestItems.otherItems.map((lang) => renderLanguageRow(lang, interestCode, setInterestCode, renderInterestLevel))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : step === "gender" ? (
          <div
            className="flex flex-1 flex-col justify-center overflow-y-auto px-6 py-4"
            style={{ paddingBottom: "max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px))" }}
          >
            <div className="mx-auto w-full max-w-sm">
              <ProfileGenderPicker
                value={gender}
                onChange={handleGenderSelect}
                copy={genderCopy}
                disabled={isConfirming}
                size="large"
              />
            </div>
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
        ) : step === "usage-purpose" ? (
          <div
            className="flex flex-1 flex-col overflow-y-auto px-5 py-5"
            style={{ paddingBottom: "max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px))" }}
          >
            <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
              {usagePurposeCopy.options.map((option) => {
                const isSelected = usagePurpose === option.code;
                return (
                  <button
                    key={option.code}
                    type="button"
                    disabled={isConfirming}
                    onClick={() => setUsagePurpose(option.code)}
                    aria-pressed={isSelected}
                    className={`flex min-h-[72px] w-full items-center gap-3 rounded-[1.35rem] border px-4 py-3 text-left transition hover:-translate-y-[1px] hover:shadow-[0_18px_36px_rgba(15,23,42,0.08)] ${
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
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.98rem] font-semibold leading-snug text-slate-900">
                        {option.label}
                      </span>
                      {option.hint ? (
                        <span className="mt-0.5 block text-[0.8rem] leading-snug text-slate-500">
                          {option.hint}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
              {usagePurpose === "other" ? (
                <textarea
                  value={usagePurposeNote}
                  disabled={isConfirming}
                  onChange={(event) => setUsagePurposeNote(event.target.value)}
                  maxLength={USAGE_PURPOSE_NOTE_MAX_LENGTH}
                  rows={3}
                  placeholder={usagePurposeCopy.otherNotePlaceholder}
                  aria-label={usagePurposeCopy.otherNotePlaceholder}
                  className="w-full resize-none rounded-[1.1rem] border border-[#e6dfd2] bg-white px-4 py-3 text-[0.95rem] leading-snug text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.05)] outline-none placeholder:text-slate-400 focus:border-amber-400"
                />
              ) : null}
            </div>
          </div>
        ) : (
          <div
            className="flex flex-1 flex-col overflow-y-auto px-5 py-5"
            style={{ paddingBottom: "max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px))" }}
          >
            <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
              {discoveryOptions.map((option) => {
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
            <p className="pb-3 text-center text-[0.78rem] text-slate-500">{copy.laterHintLabel}</p>
          ) : null}
          <button
            type="button"
            onClick={handleStepNext}
            disabled={isConfirming || !isStepAnswered(step)}
            aria-busy={isConfirming}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-amber-500 text-[0.95rem] font-semibold text-white shadow-[0_16px_32px_rgba(245,158,11,0.28)] transition hover:-translate-y-[1px] hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:opacity-70 disabled:shadow-none"
          >
            {isConfirming ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
            {isLastStep && step === "language" ? copy.confirmButtonLabel : signupCopy.continueAction}
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
