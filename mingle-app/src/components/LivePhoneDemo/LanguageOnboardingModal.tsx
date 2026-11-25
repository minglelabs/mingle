"use client";

import dynamic from "next/dynamic";
import { readKoreanAnswer, readNationalityAnswer, writeKoreanAnswer, writeNationalityAnswer, type KoreanAnswer } from "@/lib/korean-signup";
import { MAJOR_NATIONALITY_CODES, NATIONALITY_COUNTRY_CODES, countryFlagEmoji, getCountryDisplayName, supportedLanguageNationalityCodes } from "@/lib/nationality";
import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";
import { resolveKoreaVisitCopy } from "@/i18n/korea-visit-copy";
import {
  fromIsoDay,
  KOREA_VISIT_AGO_OPTIONS,
  koreaVisitEventProperties,
  pickKoreaVisitDay,
  toIsoDay,
  writeKoreaVisitAnswer,
  type KoreaVisitAgo,
  type KoreaVisitAnswer,
  type KoreaVisitField,
  type KoreaVisitPlan,
  type KoreaVisitRange,
} from "@/lib/korea-visit";
import { captureMingleClientEvent } from "@/lib/posthog-client";
import KoreaVisitCalendar from "@/components/onboarding/korea-visit-calendar";
import { resolveOnboardingExtraCopy } from "@/i18n/onboarding-extra-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { canAskMicPermission, requestMicPermission, type MicPermissionResult } from "@/lib/mic-permission";
import {
  BIO_MIN_LENGTH,
  bioLength,
  readPendingBio,
  readPendingFaceSimilarity,
  readPendingPhoto,
  squarePhotoDataUrl,
  writePendingBio,
  writePendingFaceSimilarity,
  writePendingHeight,
  writePendingPhoto,
} from "@/lib/pending-profile-extras";

// The camera and face models load only when the check opens.
// Client only (like My page): the face library has a Node build that must not reach the server.
const SelfieVerifyScreen = dynamic(() => import("@/components/selfie-verify-screen"), { ssr: false });
import { Camera, Check, ChevronLeft, Loader2, Mic, Search, X } from "lucide-react";
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
import { resolveProfileHeightCopy } from "@/i18n/profile-height-copy";
import { DEFAULT_HEIGHT_CM } from "@/lib/profile-height";
import ProfileHeightWheel from "@/components/profile-height-wheel";
import { isProfileGender, type ProfileGender } from "@/lib/profile-gender";
import { clearOnboardingDraft, readOnboardingDraft, writeOnboardingDraft } from "@/lib/onboarding-draft";
import { resolveHaveAccountCopy } from "@/i18n/have-account-copy";
import { isDiscoverySource } from "@/lib/discovery-source";

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
  /** Height in cm; asked of men only, null when not asked. */
  heightCm: number | null;
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
  /**
   * "I already have an account" on the first screen (owner, 2026-11-25): the
   * caller skips the questions and shows sign-in. Not passed, no such link.
   */
  onHaveAccount?: (language: string) => void;
}

export type OnboardingStep = "language" | "bio" | "nationality" | "korea-trip-plan" | "korea-visit" | "korea-visit-past" | "interest-language" | "profile-photo" | "voice-intro" | "usage-purpose" | "discovery-source" | "gender" | "birth-date" | "height";

// The Korea trip, for someone not Korean (see @/lib/korea-visit): first
// "korea-trip-plan" (planned / not yet / was there recently), then the
// calendar ("korea-visit") or how long ago ("korea-visit-past").
// "interest-language": asked up front (owner, 2026-11-23), not later on the feed;
// someone who is not Korean starts with Korean checked.
// One pass before sign-in (owner, 2026-11-24): everything a profile needs is
// asked here, then the microphone ("HashChat is spoken"), then sign-in. Gender,
// height (men), birth date and the photo used to be asked later, one at a time.
// "nationality" replaced "한국인이신가요?" (owner, 2026-11-25): the country is
// picked at once, Korea and the ten biggest visitor countries on top; picking
// Korea is the old "yes", anything else the old "no".
export const FIRST_RUN_ONBOARDING_STEPS: readonly OnboardingStep[] = [
  "language", "nationality", "korea-trip-plan", "korea-visit", "korea-visit-past", "interest-language",
  "gender", "height", "birth-date", "profile-photo", "bio", "discovery-source", "voice-intro",
];
// Sign-up needs a face-verified photo (no "later"). Everyone may write a
// self-introduction; men must (BIO_MIN_LENGTH+ characters), others may skip
// it (owner, 2026-11-25). It is previewed in other languages as it is written.
const BIO_PREVIEW_IDLE_MS = 5000;
// An invite already says where they came from (a friend).
export const INVITE_ONBOARDING_STEPS: readonly OnboardingStep[] = FIRST_RUN_ONBOARDING_STEPS.filter(
  (entry) => entry !== "discovery-source",
);

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
  onHaveAccount,
}: LanguageOnboardingModalProps) {
  const baseSteps = invite ? INVITE_ONBOARDING_STEPS : requestedSteps;
  // The whole first run keeps its answers on the device as they are given
  // (see @/lib/onboarding-draft): read once here, written on every change.
  const keepsDraft = baseSteps.includes("voice-intro");
  const [draft] = useState(() => (keepsDraft ? readOnboardingDraft() : null));
  const [gender, setGender] = useState<ProfileGender | null>(() => (isProfileGender(draft?.gender) ? draft.gender : null));
  const [koreanAnswer, setKoreanAnswer] = useState<KoreanAnswer | null>(() => readKoreanAnswer());
  const [koreaVisit, setKoreaVisit] = useState<KoreaVisitRange>(() => draft?.koreaVisit ?? { start: null, end: null });
  const [tripPlan, setTripPlan] = useState<KoreaVisitPlan | null>(() => (
    draft?.tripPlan === "planned" || draft?.tripPlan === "undecided" || draft?.tripPlan === "visited" ? draft.tripPlan : null
  ));
  const [tripField, setTripField] = useState<KoreaVisitField>(() => (draft?.koreaVisit.start ? "end" : "start"));
  const [visitedAgo, setVisitedAgo] = useState<KoreaVisitAgo | null>(() => (
    KOREA_VISIT_AGO_OPTIONS.find((option) => option === draft?.visitedAgo) ?? null
  ));
  // 국적 for someone who is not Korean; the avatar flag (2026-11-24), apart from languages.
  const [nationality, setNationality] = useState<string | null>(() => (
    readNationalityAnswer() ?? (readKoreanAnswer() === "yes" ? "KR" : null)
  ));
  const pickNationality = (code: string) => {
    const answer: KoreanAnswer = code === "KR" ? "yes" : "no";
    setNationality(code);
    writeNationalityAnswer(code);
    setKoreanAnswer(answer);
    writeKoreanAnswer(answer);
  };
  const [nationalityQuery, setNationalityQuery] = useState("");
  // Steps passed with "later" (the trip, the photo): finishing does not wait for them.
  const [skippedSteps, setSkippedSteps] = useState<readonly OnboardingStep[]>([]);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(() => readPendingPhoto());
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  // The selfie check opens right after a photo is picked (owner, 2026-11-24).
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [faceVerified, setFaceVerified] = useState(() => readPendingFaceSimilarity() !== null);
  // The selfie check is for men only (owner, 2026-11-25): women add a photo and go on.
  const selfieAsked = gender !== "female";
  // The face models take 10 s or more to get ready the first time: start as
  // soon as the selfie check is known to come (a man), not when it opens.
  useEffect(() => {
    if (gender !== "male" || faceVerified) return;
    void import("@/lib/selfie-human").then((module) => module.preloadSelfieModels()).catch(() => undefined);
  }, [faceVerified, gender]);
  const [micResult, setMicResult] = useState<MicPermissionResult | null>(null);
  const [micAsking, setMicAsking] = useState(false);
  // A wheel like the birth date, starting at a typical height (no keyboard).
  const [heightCm, setHeightCm] = useState<number>(draft?.heightCm ?? DEFAULT_HEIGHT_CM);
  // The wheel starts on a grey suggestion, like the birth date: the height is
  // locked once saved, so Continue waits until the person picked it (owner, 2026-11-25).
  const [heightPicked, setHeightPicked] = useState(() => draft?.heightPicked === true);
  const [bio, setBio] = useState(() => readPendingBio() ?? "");
  // The self-introduction shown in other languages (Haiku, @/server/bio-preview):
  // asked BIO_PREVIEW_IDLE_MS after the typing stops.
  const [bioPreview, setBioPreview] = useState<{ text: string; translations: Record<string, string> } | null>(null);
  const [bioPreviewBusy, setBioPreviewBusy] = useState(false);
  const [bioPreviewLanguage, setBioPreviewLanguage] = useState<string | null>(null);
  // Height is asked of men only: when the gender is asked in this same run the
  // step appears once "male" is picked; asked alone, the caller already knows.
  const stepsFor = useCallback((
    nextGender: ProfileGender | null,
    nextPlan: KoreaVisitPlan | null,
  ) => baseSteps.filter((entry) => (
    (entry !== "height" || nextGender === "male" || !baseSteps.includes("gender"))
    && (!entry.startsWith("korea-") || koreanAnswer === "no")
    && (entry !== "korea-visit" || nextPlan === "planned")
    && (entry !== "korea-visit-past" || nextPlan === "visited")
  )), [baseSteps, koreanAnswer]);
  const steps = useMemo(() => stepsFor(gender, tripPlan), [gender, stepsFor, tripPlan]);
  // Mounted only while onboarding is on screen: no native ad banner at any
  // step, whatever zone the screen underneath asked for.
  useNativeBannerSuppression();
  const titleId = useId();
  const firstStep = steps[0] ?? "language";
  const [step, setStep] = useState<OnboardingStep>(() => {
    const kept = steps.find((entry) => entry === draft?.step);
    return kept ?? firstStep;
  });
  const stepIndex = Math.max(0, steps.indexOf(step));
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex >= steps.length - 1;
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState(draft?.language ?? initialLanguage);
  const [interestQuery, setInterestQuery] = useState("");
  const [interestCode, setInterestCode] = useState<string | null>(draft?.interestCode ?? null);
  const [interestLevel, setInterestLevel] = useState(draft?.interestLevel ?? 1);
  const [birthDate, setBirthDate] = useState<BirthDateParts>(draft?.birthDate ?? initialBirthDate);
  // The wheels start on a grey suggestion; Continue waits until the person picked year, month and day.
  const [birthDatePicked, setBirthDatePicked] = useState(() => draft?.birthDatePicked === true);
  const [birthDateWasPicked] = useState(birthDatePicked);
  const [usagePurpose, setUsagePurpose] = useState<UsagePurpose | null>(null);
  const [usagePurposeNote, setUsagePurposeNote] = useState("");
  const [discoverySource, setDiscoverySource] = useState<DiscoverySource | null>(() => (
    isDiscoverySource(draft?.discoverySource) ? draft.discoverySource : null
  ));
  useEffect(() => {
    if (!keepsDraft) return;
    writeOnboardingDraft({
      step, language, gender, birthDate, birthDatePicked, heightCm, heightPicked,
      tripPlan, koreaVisit, visitedAgo, interestCode, interestLevel, discoverySource,
    });
  }, [birthDate, birthDatePicked, discoverySource, gender, heightCm, heightPicked, interestCode, interestLevel, keepsDraft, koreaVisit, language, step, tripPlan, visitedAgo]);
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
  const heightCopy = useMemo(() => resolveProfileHeightCopy(language), [language]);
  const koreaVisitCopy = useMemo(() => resolveKoreaVisitCopy(language), [language]);
  const extraCopy = useMemo(() => resolveOnboardingExtraCopy(language), [language]);
  const countryNameLocale = resolveUiLocaleForLanguage(language);
  // Five on top, then the countries of the app's languages, then every other
  // country A–Z; a search looks through all three.
  const nationalityRows = useMemo(() => {
    const collator = new Intl.Collator(countryNameLocale);
    const toRow = (code: string) => ({ code, name: getCountryDisplayName(code, countryNameLocale) });
    const major = MAJOR_NATIONALITY_CODES.map(toRow);
    const languageCountries = supportedLanguageNationalityCodes(PRIMARY_UI_LOCALES);
    const more = languageCountries.map(toRow);
    const listed = new Set([...MAJOR_NATIONALITY_CODES, ...languageCountries]);
    const rest = NATIONALITY_COUNTRY_CODES
      .filter((code) => !listed.has(code))
      .map(toRow)
      .sort((a, b) => collator.compare(a.name, b.name));
    const needle = nationalityQuery.trim().toLocaleLowerCase(countryNameLocale);
    const matches = (row: { code: string; name: string }) => (
      !needle || row.name.toLocaleLowerCase(countryNameLocale).includes(needle) || row.code.toLowerCase() === needle
    );
    return { major: major.filter(matches), more: more.filter(matches), rest: rest.filter(matches) };
  }, [countryNameLocale, nationalityQuery]);
  const formatTripDay = useCallback(
    (day: string) => new Intl.DateTimeFormat(resolveUiLocaleForLanguage(language), { month: "short", day: "numeric", weekday: "short" }).format(fromIsoDay(day)),
    [language],
  );
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
  const ownLanguageCode = canonicalizeSttLanguageCode(language);
  const ownLanguageItem = useMemo(
    () => languageItems.find((item) => canonicalizeSttLanguageCode(item.code) === ownLanguageCode) ?? null,
    [languageItems, ownLanguageCode],
  );
  // The own language can be picked too (owner, 2026-11-25): a Korean may want
  // to meet people who speak Korean.
  const interestItems = useMemo(() => {
    const visibleItems = filterLanguageSelectorItems(languageItems, interestQuery);
    return partitionLanguageSelectorItemsByPriority(sortByBrowseOrder(visibleItems));
  }, [interestQuery, languageItems, sortByBrowseOrder]);

  // Own language (most likely what it is written in), the 관심 언어, then
  // English, Korean, Chinese, Japanese: at most six.
  const bioPreviewLanguages = useMemo(() => {
    const codes = [ownLanguageCode, interestCode ? canonicalizeSttLanguageCode(interestCode) : "", "en", "ko", "zh-CN", "ja"]
      .filter((code): code is string => Boolean(code));
    return [...new Set(codes)].slice(0, 6);
  }, [interestCode, ownLanguageCode]);
  const requestBioPreview = useCallback((text: string, signal?: AbortSignal, showLanguage?: string | null) => {
    setBioPreviewBusy(true);
    void fetch(buildClientApiPath("/profile/bio-preview"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, languages: bioPreviewLanguages }),
      signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as { translations?: Record<string, string> };
        if (!data.translations) return;
        setBioPreview({ text, translations: data.translations });
        if (showLanguage && data.translations[showLanguage]) setBioPreviewLanguage(showLanguage);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!signal?.aborted) setBioPreviewBusy(false);
      });
  }, [bioPreviewLanguages]);
  useEffect(() => {
    if (step !== "bio") return;
    const text = bio.trim();
    if (!text || bioLength(text) < 2 || bioPreview?.text === text) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => requestBioPreview(text, controller.signal), BIO_PREVIEW_IDLE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [bio, bioPreview?.text, requestBioPreview, step]);
  const bioPreviewFresh = bioPreview !== null && bioPreview.text === bio.trim();

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

  const renderNationalityRow = (row: { code: string; name: string }) => {
    const selected = nationality === row.code;
    return (
      <button
        key={row.code}
        type="button"
        role="radio"
        aria-checked={selected}
        data-qa={`onboarding-nationality-${row.code}`}
        disabled={isConfirming}
        onClick={() => pickNationality(row.code)}
        className={`flex w-full items-center gap-3 rounded-[1.2rem] border px-4 py-3 text-left transition ${
          selected
            ? "border-amber-400 bg-amber-50/95"
            : "border-[#ece6db] bg-white"
        }`}
      >
        <span className="text-[1.9rem] leading-none" aria-hidden>{countryFlagEmoji(row.code)}</span>
        <span className="min-w-0 flex-1 text-[1.02rem] font-semibold text-slate-900">{row.name}</span>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${selected ? "border-amber-500 bg-amber-500 text-white" : "border-slate-300 text-transparent"}`}>
          <Check size={14} strokeWidth={3.2} />
        </span>
      </button>
    );
  };

  if (typeof document === "undefined") return null;

  const isStepAnswered = (target: OnboardingStep): boolean => (
    target === "language" ? true
      : target === "nationality" ? Boolean(nationality)
      : target === "korea-trip-plan" ? tripPlan !== null
      // The arrival alone is enough: the departure may not be known yet.
      : target === "korea-visit" ? Boolean(koreaVisit.start)
      : target === "korea-visit-past" ? visitedAgo !== null
      // Women: the photo alone, no selfie check (owner, 2026-11-25).
      : target === "profile-photo" ? Boolean(photoDataUrl) && (faceVerified || !selfieAsked)
      // Men: at least BIO_MIN_LENGTH characters; others may leave it empty (owner, 2026-11-25).
      : target === "bio" ? gender !== "male" || bioLength(bio) >= BIO_MIN_LENGTH
      : target === "voice-intro" ? true
      : target === "interest-language" ? Boolean(interestCode)
      : target === "usage-purpose" ? Boolean(usagePurpose)
      : target === "discovery-source" ? Boolean(discoverySource)
      : target === "gender" ? Boolean(gender)
      : target === "height" ? heightCm > 0 && heightPicked
        : birthDatePicked && isEligibleAge
  );

  const handleFinalConfirm = async (justSkipped: OnboardingStep | null = null) => {
    const passed = (entry: OnboardingStep) => entry === justSkipped || skippedSteps.includes(entry) || isStepAnswered(entry);
    if (isConfirming) return;
    // An answer went missing (a photo the phone could not keep): back to it.
    const missing = steps.find((entry) => !passed(entry));
    if (missing) {
      setStep(missing);
      return;
    }
    const asked = (target: OnboardingStep) => steps.includes(target);
    // Kept on the device until the account exists (PendingProfileSync saves it).
    if (asked("voice-intro")) writePendingHeight(asked("height") ? heightCm : null);
    if (asked("voice-intro")) writePendingBio(asked("bio") ? bio : null);
    setIsConfirming(true);
    try {
      await onConfirm({
        language,
        interestLanguage: asked("interest-language") && interestCode
          ? { code: interestCode as InterestLanguage["code"], level: interestLevel }
          : null,
        birthDate: asked("birth-date") ? birthDate : null,
        gender: asked("gender") ? gender : null,
        heightCm: asked("height") ? heightCm : null,
        usagePurpose: invite ? "social" : asked("usage-purpose") ? usagePurpose : null,
        usagePurposeNote: asked("usage-purpose") && usagePurpose === "other"
          ? normalizeUsagePurposeNote(usagePurposeNote)
          : null,
        discoverySource: invite ? "friend" : asked("discovery-source") ? discoverySource : null,
      });
      if (keepsDraft) clearOnboardingDraft();
    } finally {
      setIsConfirming(false);
    }
  };

  const recordKoreaVisit = (answer: KoreaVisitAnswer) => {
    writeKoreaVisitAnswer(answer);
    captureMingleClientEvent("mingle_korea_visit", koreaVisitEventProperties(answer, toIsoDay(new Date())));
  };

  // One tap answers and moves on, like the gender (the footer button stays).
  const advanceAfterTap = (from: OnboardingStep, nextSteps: readonly OnboardingStep[]) => {
    clearGenderAdvance();
    const next = nextSteps[nextSteps.indexOf(from) + 1];
    if (!next) return;
    genderAdvanceTimerRef.current = window.setTimeout(() => {
      genderAdvanceTimerRef.current = null;
      goToStep(next);
    }, GENDER_AUTO_ADVANCE_MS);
  };

  const handleTripPlanSelect = (plan: KoreaVisitPlan) => {
    if (isConfirming) return;
    setTripPlan(plan);
    if (plan === "undecided") recordKoreaVisit({ kind: "undecided" });
    if (plan === "planned") setTripField(koreaVisit.start ? "end" : "start");
    if (isLastStep && plan === "undecided") return;
    advanceAfterTap("korea-trip-plan", stepsFor(gender, plan));
  };

  const handleVisitedAgoSelect = (ago: KoreaVisitAgo) => {
    if (isConfirming) return;
    setVisitedAgo(ago);
    recordKoreaVisit({ kind: "visited", ago });
    if (isLastStep) return;
    advanceAfterTap("korea-visit-past", steps);
  };

  const handleTripDayPick = (day: string) => {
    const picked = pickKoreaVisitDay(koreaVisit, day, tripField);
    setKoreaVisit(picked.range);
    setTripField(picked.field);
  };

  const handlePhotoPicked = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(false);
    try {
      // Kept on the phone until sign-in. A phone short of storage gets a
      // smaller copy; one that cannot keep any says so instead of letting the
      // account be made without a photo.
      let dataUrl = await squarePhotoDataUrl(file);
      let kept = writePendingPhoto(dataUrl);
      for (const size of [480, 320]) {
        if (kept) break;
        dataUrl = await squarePhotoDataUrl(file, size);
        kept = writePendingPhoto(dataUrl);
      }
      if (!kept) throw new Error("photo_not_kept");
      writePendingFaceSimilarity(null);
      setFaceVerified(false);
      setPhotoDataUrl(dataUrl);
      if (selfieAsked) setSelfieOpen(true);
      setSkippedSteps((current) => current.filter((entry) => entry !== "profile-photo"));
      captureMingleClientEvent("mingle_onboarding_photo", { result: "picked" });
    } catch {
      setPhotoError(true);
    } finally {
      setPhotoBusy(false);
    }
  };

  // "HashChat is spoken": asks for the microphone here, then goes on whatever
  // the answer (the speak trial asks again if it was refused).
  const handleVoiceIntroNext = async () => {
    if (isConfirming || micAsking) return;
    if (canAskMicPermission() && micResult !== "granted") {
      setMicAsking(true);
      const result = await requestMicPermission();
      setMicAsking(false);
      setMicResult(result);
      captureMingleClientEvent("mingle_onboarding_mic", { result });
    }
    if (isLastStep) {
      void handleFinalConfirm();
      return;
    }
    goToStep(steps[stepIndex + 1]);
  };

  // The footer button: on to the next screen, or finish on the last one.
  const handleStepNext = () => {
    if (isConfirming || !isStepAnswered(step)) return;
    if (step === "korea-visit" && koreaVisit.start) {
      recordKoreaVisit({ kind: "dates", start: koreaVisit.start, end: koreaVisit.end });
    }
    if (step === "gender") clearGenderAdvance();
    // Continue before the idle timer translated it (owner, 2026-11-25): the
    // translation is shown now, in the first other language; the next tap goes on.
    const bioText = bio.trim();
    if (step === "bio" && bioLength(bioText) >= 2 && bioPreview?.text !== bioText && !bioPreviewBusy) {
      const showLanguage = bioPreviewLanguages.find((code) => code !== ownLanguageCode) ?? null;
      requestBioPreview(bioText, undefined, showLanguage);
      return;
    }
    if (isLastStep) {
      void handleFinalConfirm();
      return;
    }
    goToStep(steps[stepIndex + 1]);
  };

  // Entering the 관심 언어 step: someone who is not Korean starts with Korean
  // checked (the app is for meeting Koreans), so one tap moves on.
  const goToStep = (next: OnboardingStep) => {
    if (next === "interest-language" && !interestCode && koreanAnswer === "no" && ownLanguageCode !== "ko") {
      const korean = languageItems.find((item) => canonicalizeSttLanguageCode(item.code) === "ko");
      if (korean) setInterestCode(korean.code);
    }
    setStep(next);
  };

  // A tap picks the gender and stays: the footer button moves on (owner,
  // 2026-11-25: jumping to the height screen before Continue felt abrupt).
  const handleGenderSelect = (nextGender: ProfileGender) => {
    if (isConfirming) return;
    setGender(nextGender);
    clearGenderAdvance();
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
          <span suppressHydrationWarning className="block leading-snug [overflow-wrap:anywhere] text-[1.3rem] font-bold tracking-[-0.01em] text-slate-950">
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
      className="keyboard-safe fixed inset-0 bg-[rgba(248,245,239,0.94)] backdrop-blur-sm"
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
          ) : step === "nationality" ? (
            <div className="space-y-3 px-4 pb-4 pt-0">
              <div className="space-y-1.5 px-2 text-center">
                <h2 id={titleId} className="text-[1.6rem] font-extrabold leading-tight tracking-[-0.02em] text-slate-950">
                  {extraCopy.nationalityTitle}
                </h2>
                <p className="text-[0.92rem] leading-snug text-slate-500">{extraCopy.nationalityDescription}</p>
              </div>
              <div className="flex h-12 min-w-0 items-center gap-2.5 rounded-[16px] border border-[#e6dfd2] bg-white px-3.5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                <Search size={18} className="shrink-0 text-slate-400" />
                <input
                  type="search"
                  value={nationalityQuery}
                  disabled={isConfirming}
                  onChange={(event) => setNationalityQuery(event.target.value)}
                  placeholder={extraCopy.nationalitySearch}
                  className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-slate-400"
                  enterKeyHint="search"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            </div>
          ) : step === "korea-trip-plan" ? (
            <div className="px-6 pb-4 pt-0 text-center">
              <h2 id={titleId} className="text-[1.6rem] font-extrabold leading-tight tracking-[-0.02em] text-slate-950">
                {koreaVisitCopy.planQuestion}
              </h2>
            </div>
          ) : step === "korea-visit-past" ? (
            <div className="px-6 pb-4 pt-0 text-center">
              <h2 id={titleId} className="text-[1.6rem] font-extrabold leading-tight tracking-[-0.02em] text-slate-950">
                {koreaVisitCopy.visitedTitle}
              </h2>
            </div>
          ) : step === "korea-visit" ? (
            <div className="space-y-3 px-5 pb-3 pt-0">
              <h2 id={titleId} className="text-center text-[1.5rem] font-extrabold leading-tight tracking-[-0.02em] text-slate-950">
                {koreaVisitCopy.title}
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {(["start", "end"] as const).map((field) => {
                  const value = koreaVisit[field];
                  const locked = field === "end" && !koreaVisit.start;
                  const active = tripField === field && !locked;
                  return (
                    <button
                      key={field}
                      type="button"
                      data-qa={`korea-visit-field-${field}`}
                      aria-pressed={active}
                      disabled={isConfirming || locked}
                      onClick={() => setTripField(field)}
                      className={`flex flex-col items-start rounded-2xl border-2 px-3.5 py-2.5 text-left transition disabled:opacity-40 ${
                        active ? "border-amber-500 bg-amber-50" : "border-[#e6dfd2] bg-white"
                      }`}
                    >
                      <span className={`flex items-center gap-1 text-[0.8rem] font-bold ${value ? "text-emerald-600" : "text-slate-500"}`}>
                        {value ? <Check size={14} strokeWidth={3} aria-hidden /> : null}
                        {field === "start" ? koreaVisitCopy.arrive : koreaVisitCopy.leave}
                      </span>
                      <span className={`mt-0.5 text-[1.02rem] font-bold ${value ? "text-slate-950" : "text-slate-300"}`}>
                        {value ? formatTripDay(value) : "—"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : step === "profile-photo" ? (
            <div className="space-y-2 px-6 pb-4 pt-0 text-center">
              <h2 id={titleId} className="text-[1.6rem] font-extrabold leading-tight tracking-[-0.02em] text-slate-950">
                {extraCopy.photoTitle}
              </h2>
              <p className="text-[0.92rem] leading-snug text-slate-500">{selfieAsked ? extraCopy.photoDescription : extraCopy.photoDescriptionNoSelfie}</p>
            </div>
          ) : step === "voice-intro" ? (
            <div className="space-y-3 px-6 pb-4 pt-2 text-left">
              {/* Title only (owner, 2026-11-25): no label, no paragraph. */}
              <h2 id={titleId} className="whitespace-pre-line text-[1.75rem] font-extrabold leading-[1.25] tracking-[-0.03em] text-slate-950">
                {extraCopy.voiceTitle}
              </h2>
            </div>
          ) : step === "gender" ? (
            <div className="space-y-2 px-6 pb-4 pt-0 text-center">
              <h2
                id={titleId}
                className="text-[1.4rem] font-bold leading-tight tracking-[-0.02em] text-slate-950"
              >
                {genderCopy.stepTitle}
              </h2>
            </div>
          ) : step === "height" ? (
            <div className="space-y-2 px-6 pb-4 pt-0 text-center">
              <h2
                id={titleId}
                className="text-[1.4rem] font-bold leading-tight tracking-[-0.02em] text-slate-950"
              >
                {heightCopy.stepTitle}
              </h2>
              <p className="text-[0.85rem] leading-relaxed text-slate-500">
                {heightCopy.hint}
              </p>
            </div>
          ) : step === "bio" ? (
            <div className="space-y-2 px-6 pb-4 pt-0 text-center">
              <h2 id={titleId} className="text-[1.6rem] font-extrabold leading-tight tracking-[-0.02em] text-slate-950">
                {extraCopy.bioTitle}
              </h2>
              <p className="text-[0.92rem] leading-snug text-slate-500">
                {gender === "male" ? extraCopy.bioDescription : extraCopy.bioDescriptionOptional}
              </p>
              {gender !== "male" ? (
                <button
                  type="button"
                  data-qa="onboarding-bio-skip"
                  disabled={isConfirming}
                  onClick={() => {
                    setBio("");
                    if (isLastStep) {
                      void handleFinalConfirm();
                      return;
                    }
                    goToStep(steps[stepIndex + 1]);
                  }}
                  className="pt-0.5 text-[0.85rem] font-medium text-slate-500 underline underline-offset-4"
                >
                  {extraCopy.photoSkip}
                </button>
              ) : null}
            </div>
          ) : step === "birth-date" ? (
            <div className="space-y-2 px-6 pb-4 pt-0 text-center">
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
              <h2
                id={titleId}
                className="text-[1.4rem] font-bold leading-tight tracking-[-0.02em] text-slate-950"
              >
                {usagePurposeCopy.title}
              </h2>
            </div>
          ) : (
            <div className="space-y-2 px-6 pb-4 pt-0 text-center">
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
        ) : step === "nationality" ? (
          <div
            className="flex-1 overflow-y-auto px-4"
            style={{ paddingBottom: "max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px))" }}
          >
            <div className="space-y-2 py-3" role="radiogroup" aria-labelledby={titleId}>
              {nationalityRows.major.length + nationalityRows.more.length + nationalityRows.rest.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">{copy.noResultsLabel}</p>
              ) : null}
              {nationalityRows.major.length > 0 && !nationalityQuery.trim() ? (
                <p className="px-1 pt-1 text-[0.78rem] font-bold text-slate-500">{extraCopy.nationalityMajor}</p>
              ) : null}
              {nationalityRows.major.map(renderNationalityRow)}
              {nationalityRows.more.length > 0 && !nationalityQuery.trim() ? (
                <p className="px-1 pt-4 text-[0.78rem] font-bold text-slate-500">{extraCopy.nationalityMore}</p>
              ) : null}
              {nationalityRows.more.map(renderNationalityRow)}
              {nationalityRows.rest.length > 0 && !nationalityQuery.trim() ? (
                <p className="px-1 pt-4 text-[0.78rem] font-bold text-slate-500">{extraCopy.nationalityAll}</p>
              ) : null}
              {nationalityRows.rest.map(renderNationalityRow)}
            </div>
          </div>
        ) : step === "korea-visit" ? (
          <div className="min-h-0 flex-1 border-t border-gray-100">
            <KoreaVisitCalendar
              locale={resolveUiLocaleForLanguage(language)}
              value={koreaVisit}
              onPickDay={handleTripDayPick}
              disabled={isConfirming}
            />
          </div>
        ) : step === "korea-trip-plan" || step === "korea-visit-past" ? (
          <div
            className="flex flex-1 flex-col justify-center overflow-y-auto px-6 py-4"
            style={{ paddingBottom: "max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px))" }}
          >
            <div className="mx-auto flex w-full max-w-sm flex-col gap-3" role="radiogroup" aria-labelledby={titleId}>
              {(step === "korea-trip-plan"
                ? (["planned", "undecided", "visited"] as const).map((plan) => ({
                  key: plan,
                  label: koreaVisitCopy[plan],
                  selected: tripPlan === plan,
                  onSelect: () => handleTripPlanSelect(plan),
                }))
                : KOREA_VISIT_AGO_OPTIONS.map((ago) => ({
                  key: ago,
                  label: koreaVisitCopy.ago[ago],
                  selected: visitedAgo === ago,
                  onSelect: () => handleVisitedAgoSelect(ago),
                }))
              ).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={option.selected}
                  data-qa={`korea-visit-option-${option.key}`}
                  disabled={isConfirming}
                  onClick={option.onSelect}
                  className={`flex h-[3.75rem] w-full items-center justify-center gap-2 rounded-[20px] border-2 text-[1.08rem] font-bold transition active:scale-[0.99] ${option.selected ? "border-amber-500 bg-amber-50 text-slate-950" : "border-[#e6dfd2] bg-white text-slate-700"}`}
                >
                  {option.label}
                  {option.selected ? <Check size={20} strokeWidth={3} className="text-amber-600" aria-hidden /> : null}
                </button>
              ))}
            </div>
          </div>
        ) : step === "profile-photo" ? (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-6 py-4"
            style={{ paddingBottom: "max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px))" }}
          >
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              className="hidden"
              onChange={(event) => {
                void handlePhotoPicked(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              data-qa="onboarding-photo-pick"
              disabled={isConfirming || photoBusy}
              onClick={() => photoInputRef.current?.click()}
              className="relative flex h-48 w-48 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-amber-300 bg-amber-50 text-amber-500 transition active:scale-[0.98]"
              aria-label={photoDataUrl ? extraCopy.photoChange : extraCopy.photoPick}
            >
              {photoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local data URL, not a remote image
                <img src={photoDataUrl} alt="" className="h-full w-full object-cover" />
              ) : photoBusy ? (
                <Loader2 size={36} className="animate-spin" aria-hidden />
              ) : (
                <Camera size={52} strokeWidth={1.8} aria-hidden />
              )}
            </button>
            <button
              type="button"
              disabled={isConfirming || photoBusy}
              onClick={() => photoInputRef.current?.click()}
              className="rounded-full border border-[#e6dfd2] bg-white px-5 py-2.5 text-[0.95rem] font-semibold text-slate-800 shadow-[0_8px_24px_rgba(15,23,42,0.05)]"
            >
              {photoDataUrl ? extraCopy.photoChange : extraCopy.photoPick}
            </button>
            {photoDataUrl && selfieAsked ? (
              faceVerified ? (
                <p data-qa="onboarding-face-verified" className="flex items-center gap-1.5 text-[0.9rem] font-semibold text-emerald-600">
                  <Check size={16} strokeWidth={3} aria-hidden />
                  {extraCopy.faceVerified}
                </p>
              ) : (
                <button
                  type="button"
                  data-qa="onboarding-face-check"
                  disabled={isConfirming}
                  onClick={() => setSelfieOpen(true)}
                  className="rounded-full bg-slate-950 px-6 py-3 text-[0.98rem] font-bold text-white active:scale-[0.98]"
                >
                  {extraCopy.faceCheck}
                </button>
              )
            ) : null}
            {photoError ? <p className="text-center text-[0.85rem] text-rose-600">{extraCopy.photoFailed}</p> : null}
            {selfieOpen && photoDataUrl ? (
              <>
                <SelfieVerifyScreen
                  locale={language}
                  hasPhoto
                  localPhoto={photoDataUrl}
                  onLocalMatch={(similarity) => {
                    writePendingFaceSimilarity(similarity);
                    setFaceVerified(true);
                    captureMingleClientEvent("mingle_onboarding_photo", { result: "face_verified" });
                  }}
                  onVerified={() => undefined}
                  onClose={() => setSelfieOpen(false)}
                />
              </>
            ) : null}
          </div>
        ) : step === "voice-intro" ? (
          <div
            className="flex flex-1 flex-col justify-between overflow-y-auto px-6 py-4"
            style={{ paddingBottom: "max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px))" }}
          >
            <div className="flex flex-1 items-center justify-center" aria-hidden>
              <div className="relative flex h-40 w-40 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-amber-200/60 [animation-duration:2.4s]" />
                <span className="absolute inset-4 rounded-full bg-amber-200/70" />
                <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-amber-400 text-white shadow-[0_16px_32px_rgba(245,158,11,0.35)]">
                  <Mic size={44} strokeWidth={2.2} />
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-[24px] bg-amber-50 px-4 py-4" data-qa="onboarding-mic-card">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-amber-400 text-white">
                <Mic size={26} strokeWidth={2.4} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[1.05rem] font-bold text-slate-950">{extraCopy.micTitle}</span>
                <span className="mt-0.5 block text-[0.86rem] leading-snug text-slate-500">
                  {micResult === "granted" ? extraCopy.micGranted : micResult === "denied" || micResult === "blocked" ? extraCopy.micDenied : extraCopy.micDescription}
                </span>
              </span>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${micResult === "granted" ? "border-amber-500 bg-amber-500 text-white" : "border-slate-300 bg-white text-transparent"}`}>
                <Check size={16} strokeWidth={3.2} aria-hidden />
              </span>
            </div>
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
        ) : step === "height" ? (
          <div
            className="flex flex-1 flex-col justify-center overflow-y-auto px-6 py-4"
            style={{ paddingBottom: "max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px))" }}
          >
            <div data-qa="onboarding-height">
              <ProfileHeightWheel value={heightCm} onChange={setHeightCm} picked={heightPicked} onPicked={() => setHeightPicked(true)} />
            </div>
          </div>
        ) : step === "bio" ? (
          <div
            className="flex flex-1 flex-col overflow-y-auto px-6 py-2"
            style={{ paddingBottom: "max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px))" }}
          >
            <textarea
              data-qa="onboarding-bio"
              value={bio}
              disabled={isConfirming}
              maxLength={160}
              rows={5}
              onChange={(event) => setBio(event.target.value)}
              placeholder={extraCopy.bioPlaceholder}
              className="w-full resize-none rounded-[18px] border border-[#e6dfd2] bg-white px-4 py-3.5 text-[1rem] leading-relaxed text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.05)] outline-none placeholder:text-slate-400 focus:border-amber-400"
            />
            {gender === "male" ? (
              <p
                data-qa="onboarding-bio-count"
                className={`mt-2 text-right text-[0.85rem] font-semibold tabular-nums ${bioLength(bio) >= BIO_MIN_LENGTH ? "text-emerald-600" : "text-slate-400"}`}
              >
                {extraCopy.bioCount.replace("{count}", String(Math.min(bioLength(bio), BIO_MIN_LENGTH)))}
              </p>
            ) : null}
            {/* The flags: tap one to read the introduction in that language. */}
            <div data-qa="onboarding-bio-languages" className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setBioPreviewLanguage(null)}
                className={`h-9 rounded-full border px-3 text-[0.85rem] font-semibold ${bioPreviewLanguage === null || !bioPreviewFresh ? "border-amber-500 bg-amber-50 text-slate-900" : "border-[#e6dfd2] bg-white text-slate-600"}`}
              >
                {extraCopy.bioOriginal}
              </button>
              {bioPreviewLanguages.map((code) => {
                const ready = bioPreviewFresh && Boolean(bioPreview?.translations[code]);
                return (
                  <button
                    key={code}
                    type="button"
                    data-qa={`onboarding-bio-flag-${code}`}
                    disabled={!ready}
                    aria-pressed={bioPreviewLanguage === code}
                    onClick={() => setBioPreviewLanguage(code)}
                    className={`flex h-9 w-11 items-center justify-center rounded-full border transition disabled:opacity-30 ${bioPreviewLanguage === code && ready ? "border-amber-500 bg-amber-50" : "border-[#e6dfd2] bg-white"}`}
                  >
                    <LanguageFlag language={code} className="text-[1.3rem] leading-none" />
                  </button>
                );
              })}
              {bioPreviewBusy ? <Loader2 size={16} className="animate-spin text-slate-400" aria-label={extraCopy.bioTranslating} /> : null}
            </div>
            {bioPreviewFresh && bioPreviewLanguage && bioPreview?.translations[bioPreviewLanguage] ? (
              <p data-qa="onboarding-bio-translation" className="mt-3 whitespace-pre-line rounded-[18px] bg-slate-100 px-4 py-3 text-[0.98rem] leading-relaxed text-slate-800">
                {bioPreview.translations[bioPreviewLanguage]}
              </p>
            ) : (
              <p className="mt-3 text-[0.8rem] text-slate-400">{bioPreviewBusy ? extraCopy.bioTranslating : extraCopy.bioTranslateHint}</p>
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
                onPickedChange={setBirthDatePicked}
                initialPicked={birthDateWasPicked}
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
                {!birthDatePicked || isEligibleAge ? signupCopy.birthDateAgeHint : signupCopy.birthDateUnderage}
              </div>
              <p data-qa="onboarding-birth-date-lock" className="mt-3 text-center text-[0.82rem] leading-relaxed text-slate-500">
                {signupCopy.birthDateLockNotice}
              </p>
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
            onClick={step === "voice-intro" ? () => void handleVoiceIntroNext() : handleStepNext}
            data-qa="onboarding-next"
            disabled={isConfirming || micAsking || !isStepAnswered(step)}
            aria-busy={isConfirming || micAsking}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-amber-500 text-[0.95rem] font-semibold text-white shadow-[0_16px_32px_rgba(245,158,11,0.28)] transition hover:-translate-y-[1px] hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:opacity-70 disabled:shadow-none"
          >
            {isConfirming || micAsking ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
            {step === "voice-intro" && canAskMicPermission() && micResult !== "granted"
              ? extraCopy.micAllow
              : isLastStep && (step === "language" || step === "korea-visit" || step === "interest-language" || step === "voice-intro")
                ? copy.confirmButtonLabel
                : signupCopy.continueAction}
          </button>
          {step === "language" && onHaveAccount ? (
            <button
              type="button"
              data-qa="onboarding-have-account"
              disabled={isConfirming}
              onClick={() => {
                clearOnboardingDraft();
                onHaveAccount(language);
              }}
              className="mt-1 flex h-11 w-full items-center justify-center rounded-full text-[0.9rem] font-semibold text-slate-600 underline-offset-4 active:text-slate-950"
            >
              {resolveHaveAccountCopy(language)}
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
