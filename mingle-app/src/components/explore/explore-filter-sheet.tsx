"use client";

import { useNativeBannerSuppression } from "@/lib/use-native-banner-suppression";
import { X } from "lucide-react";
import { useState } from "react";
import type { PeopleSafetyCopy } from "@/i18n/people-safety-copy";
import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";
import { getSttLanguageDisplayName } from "@/lib/stt-languages";

/** The explore tab's filters (owner, 2026-11-25); the server reads the same names (server/people-discovery). */
export type ExploreFilters = {
  gender: "female" | "male" | null;
  ageMin: number;
  ageMax: number;
  onlineOnly: boolean;
  /** Has this among their own languages (편한 언어); null = any. */
  primaryLanguage: string | null;
  /** Has this among their 관심 언어; null = any. */
  interestLanguage: string | null;
};

export const EXPLORE_AGE_MIN = 18;
export const EXPLORE_AGE_MAX = 60;
// No language filter by default (owner, 2026-11-25): there are few people at first.
export const NO_EXPLORE_FILTERS: ExploreFilters = { gender: null, ageMin: EXPLORE_AGE_MIN, ageMax: EXPLORE_AGE_MAX, onlineOnly: false, primaryLanguage: null, interestLanguage: null };
/** The languages the two language filters offer. */
export const EXPLORE_FILTER_LANGUAGES: readonly string[] = PRIMARY_UI_LOCALES;
const STORAGE_KEY = "mingle.explore.filters.v1";

export function isFiltering(filters: ExploreFilters): boolean {
  return filters.gender !== null || filters.ageMin > EXPLORE_AGE_MIN || filters.ageMax < EXPLORE_AGE_MAX || filters.onlineOnly
    || filters.primaryLanguage !== null || filters.interestLanguage !== null;
}

/** The query the discover API takes; the ends of the age range are left out (no limit). */
export function exploreFilterParams(filters: ExploreFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.gender) params.gender = filters.gender;
  if (filters.ageMin > EXPLORE_AGE_MIN) params.ageMin = String(filters.ageMin);
  if (filters.ageMax < EXPLORE_AGE_MAX) params.ageMax = String(filters.ageMax);
  if (filters.onlineOnly) params.online = "1";
  if (filters.primaryLanguage) params.primaryLanguage = filters.primaryLanguage;
  if (filters.interestLanguage) params.interestLanguage = filters.interestLanguage;
  return params;
}

export function readExploreFilters(): ExploreFilters {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<ExploreFilters> | null;
    if (!raw) return NO_EXPLORE_FILTERS;
    const age = (value: unknown, fallback: number) => (
      typeof value === "number" && Number.isInteger(value) && value >= EXPLORE_AGE_MIN && value <= EXPLORE_AGE_MAX ? value : fallback
    );
    const language = (value: unknown) => (typeof value === "string" && EXPLORE_FILTER_LANGUAGES.includes(value) ? value : null);
    const ageMin = age(raw.ageMin, EXPLORE_AGE_MIN);
    const ageMax = age(raw.ageMax, EXPLORE_AGE_MAX);
    return {
      gender: raw.gender === "female" || raw.gender === "male" ? raw.gender : null,
      ageMin: Math.min(ageMin, ageMax),
      ageMax: Math.max(ageMin, ageMax),
      onlineOnly: raw.onlineOnly === true,
      primaryLanguage: language(raw.primaryLanguage),
      interestLanguage: language(raw.interestLanguage),
    };
  } catch {
    return NO_EXPLORE_FILTERS;
  }
}

export function writeExploreFilters(filters: ExploreFilters): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Kept for this visit only.
  }
}

const AGES = Array.from({ length: EXPLORE_AGE_MAX - EXPLORE_AGE_MIN + 1 }, (_, index) => EXPLORE_AGE_MIN + index);

export default function ExploreFilterSheet({
  copy,
  locale,
  value,
  onApply,
  onClose,
}: {
  copy: PeopleSafetyCopy;
  /** For the names of the languages. */
  locale: string;
  value: ExploreFilters;
  onApply: (filters: ExploreFilters) => void;
  onClose: () => void;
}) {
  // The app's ad banner draws above the page: none while the sheet is open.
  useNativeBannerSuppression();
  const [draft, setDraft] = useState<ExploreFilters>(value);
  const genders: Array<{ key: ExploreFilters["gender"]; label: string }> = [
    { key: null, label: copy.filterAll },
    { key: "female", label: copy.filterWomen },
    { key: "male", label: copy.filterMen },
  ];
  const ageLabel = (age: number, end: "min" | "max") => (
    (end === "min" && age === EXPLORE_AGE_MIN) || (end === "max" && age === EXPLORE_AGE_MAX)
      ? `${age}${end === "max" ? "+" : ""}`
      : String(age)
  );

  return (
    <div className="fixed inset-0 z-[230] flex items-end bg-slate-950/40" role="dialog" aria-modal="true" aria-label={copy.filterTitle} onClick={onClose}>
      <div
        data-qa="explore-filter-sheet"
        className="w-full rounded-t-[1.6rem] bg-white px-5 pt-4"
        style={{ paddingBottom: "max(20px, calc(env(safe-area-inset-bottom, 0px) + 12px))" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[1.15rem] font-extrabold text-slate-950">{copy.filterTitle}</h2>
          <button type="button" onClick={onClose} aria-label={copy.filterTitle} className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <X size={17} strokeWidth={2.6} aria-hidden="true" />
          </button>
        </div>

        <p className="mt-4 text-[13px] font-bold text-slate-500">{copy.filterGender}</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {genders.map((option) => (
            <button
              key={option.key ?? "all"}
              type="button"
              data-qa={`explore-filter-gender-${option.key ?? "all"}`}
              aria-pressed={draft.gender === option.key}
              onClick={() => setDraft((current) => ({ ...current, gender: option.key }))}
              className={`h-11 rounded-xl border text-[14px] font-bold transition ${draft.gender === option.key ? "border-amber-400 bg-amber-50 text-slate-950" : "border-gray-200 bg-white text-slate-600"}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <p className="mt-5 text-[13px] font-bold text-slate-500">{copy.filterAge}</p>
        <div className="mt-2 flex items-center gap-2">
          <select
            data-qa="explore-filter-age-min"
            value={draft.ageMin}
            onChange={(event) => {
              const ageMin = Number(event.target.value);
              setDraft((current) => ({ ...current, ageMin, ageMax: Math.max(current.ageMax, ageMin) }));
            }}
            className="h-11 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-[15px] font-semibold text-slate-900"
          >
            {AGES.map((age) => <option key={age} value={age}>{ageLabel(age, "min")}</option>)}
          </select>
          <span className="text-slate-400">–</span>
          <select
            data-qa="explore-filter-age-max"
            value={draft.ageMax}
            onChange={(event) => {
              const ageMax = Number(event.target.value);
              setDraft((current) => ({ ...current, ageMax, ageMin: Math.min(current.ageMin, ageMax) }));
            }}
            className="h-11 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-[15px] font-semibold text-slate-900"
          >
            {AGES.map((age) => <option key={age} value={age}>{ageLabel(age, "max")}</option>)}
          </select>
        </div>

        {/* Languages (owner, 2026-11-25): each on its own, "all" until picked. */}
        <div className="mt-5 grid grid-cols-2 gap-2">
          {([
            { key: "primaryLanguage", label: copy.filterOwnLanguage },
            { key: "interestLanguage", label: copy.filterInterestLanguage },
          ] as const).map((field) => (
            <label key={field.key} className="block min-w-0">
              <span className="text-[13px] font-bold text-slate-500">{field.label}</span>
              <select
                data-qa={`explore-filter-${field.key}`}
                value={draft[field.key] ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value || null }))}
                className={`mt-2 h-11 w-full rounded-xl border bg-white px-3 text-[15px] font-semibold ${draft[field.key] ? "border-amber-400 text-slate-950" : "border-gray-200 text-slate-600"}`}
              >
                <option value="">{copy.filterAll}</option>
                {EXPLORE_FILTER_LANGUAGES.map((code) => (
                  <option key={code} value={code}>{getSttLanguageDisplayName(code, locale) || code}</option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <label className="mt-5 flex cursor-pointer items-center justify-between gap-3">
          <span className="text-[14px] font-bold text-slate-800">{copy.filterOnlineOnly}</span>
          <input
            type="checkbox"
            role="switch"
            data-qa="explore-filter-online"
            checked={draft.onlineOnly}
            onChange={(event) => setDraft((current) => ({ ...current, onlineOnly: event.target.checked }))}
            className="sr-only"
          />
          <span aria-hidden="true" className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition ${draft.onlineOnly ? "bg-amber-500" : "bg-gray-300"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${draft.onlineOnly ? "left-[18px]" : "left-0.5"}`} />
          </span>
        </label>

        <div className="mt-6 grid grid-cols-[1fr_2fr] gap-2">
          <button
            type="button"
            data-qa="explore-filter-reset"
            onClick={() => setDraft(NO_EXPLORE_FILTERS)}
            className="h-12 rounded-full border border-gray-200 text-[15px] font-bold text-slate-700"
          >
            {copy.filterReset}
          </button>
          <button
            type="button"
            data-qa="explore-filter-apply"
            onClick={() => onApply(draft)}
            className="h-12 rounded-full bg-amber-500 text-[15px] font-bold text-white"
          >
            {copy.filterApply}
          </button>
        </div>
      </div>
    </div>
  );
}
