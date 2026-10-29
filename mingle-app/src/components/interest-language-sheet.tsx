"use client";

import { Check, Loader2, Search, X } from "lucide-react";
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
import LanguageFlag from "@/components/language-flag";
import LanguageLevelPicker from "@/components/language-level-picker";
import { resolveInterestLanguageCopy } from "@/i18n/interest-language-copy";
import { registerNativeBackHandler } from "@/lib/native-back-handler";
import type { InterestLanguage } from "@/lib/interest-languages";
import { canonicalizeSttLanguageCode } from "@/lib/stt-languages";

/**
 * Picks one 관심 언어 and its 1-5 level, the onboarding step on its own: for
 * users who joined before the step existed (asked from the feed) and for the
 * profile's "+ add" entry. `onSave` resolves false when saving failed.
 */
export default function InterestLanguageSheet({
  locale,
  primaryLanguages,
  onSave,
  onClose,
  closeLabel,
}: {
  locale: string;
  /** Left out of the list: a 관심 언어 is never one the user already speaks. */
  primaryLanguages: readonly string[];
  onSave: (language: InterestLanguage) => Promise<boolean>;
  onClose: () => void;
  /** The dismiss button's label: "Later" when asked unprompted, otherwise close. */
  closeLabel?: string;
}) {
  const titleId = useId();
  const copy = useMemo(() => resolveLanguageOnboardingCopy(locale), [locale]);
  const interestCopy = useMemo(() => resolveInterestLanguageCopy(locale), [locale]);
  const [query, setQuery] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [level, setLevel] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const spoken = useMemo(() => new Set(primaryLanguages.map((language) => canonicalizeSttLanguageCode(language))), [primaryLanguages]);
  const languageItems = useMemo(() => buildLanguageSelectorItems(locale), [locale]);
  const { priorityItems, otherItems } = useMemo(() => {
    const visible = filterLanguageSelectorItems(languageItems, query)
      .filter((item) => !spoken.has(canonicalizeSttLanguageCode(item.code)));
    return partitionLanguageSelectorItemsByPriority(sortLanguageSelectorItems(visible, "locale", locale));
  }, [languageItems, locale, query, spoken]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => registerNativeBackHandler(() => {
    if (!saving) onClose();
    return true;
  }), [onClose, saving]);

  async function save() {
    if (!code || saving) return;
    setSaving(true);
    setError(false);
    const ok = await onSave({ code: code as InterestLanguage["code"], level });
    setSaving(false);
    if (ok) onClose();
    else setError(true);
  }

  const renderRow = (lang: LanguageSelectorItem) => {
    const selected = code === lang.code;
    return (
      <button
        key={lang.code}
        type="button"
        disabled={saving}
        onClick={() => setCode(lang.code)}
        aria-pressed={selected}
        className={`flex w-full items-center gap-4 rounded-[1.6rem] border px-4 py-3 text-left transition ${
          selected
            ? "border-amber-400 bg-amber-50/95 shadow-[0_16px_32px_rgba(245,158,11,0.12)]"
            : "border-[#ece6db] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.05)]"
        }`}
      >
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border shadow-sm ${selected ? "border-amber-300 bg-white" : "border-[#e5dfd5] bg-[#faf7f1]"}`}>
          <LanguageFlag language={lang.code} className="translate-y-[0.12em] text-[2rem] leading-none" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[1rem] font-semibold tracking-[-0.01em] text-slate-950">{lang.localizedName}</span>
          <span className="mt-0.5 block truncate text-[0.9rem] text-slate-500">{lang.secondaryLabel}</span>
        </span>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${selected ? "border-amber-500 bg-amber-500 text-white" : "border-slate-300 text-transparent"}`}>
          <Check size={14} strokeWidth={3.2} />
        </span>
      </button>
    );
  };

  const overlay = (
    <div className="fixed inset-0 bg-[rgba(248,245,239,0.94)] backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ zIndex: 250 }}>
      <div className="mx-auto flex h-full w-full max-w-[540px] flex-col bg-[#fcfbf8] text-slate-950 shadow-[0_32px_80px_rgba(15,23,42,0.16)]">
        <header className="shrink-0 border-b border-gray-100 bg-[#fcfbf8]">
          <div aria-hidden="true" style={{ height: "env(safe-area-inset-top, 0px)" }} />
          <div className="flex h-12 items-center justify-end px-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="inline-flex h-[38px] min-w-[40px] shrink-0 items-center justify-center gap-1 px-2 text-[0.9rem] font-medium text-gray-600 transition-colors hover:text-gray-900 disabled:opacity-50"
              aria-label={closeLabel ?? copy.closeLabel}
            >
              {closeLabel ?? <X size={20} strokeWidth={2.4} />}
            </button>
          </div>
          <div className="space-y-4 px-4 pb-4 pt-0">
            <div className="space-y-1.5 text-center">
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-amber-600">{interestCopy.onboardingStep}</p>
              <h2 id={titleId} className="text-[1.3rem] font-bold leading-tight tracking-[-0.02em] text-slate-950">{interestCopy.onboardingTitle}</h2>
              <p className="text-[0.82rem] leading-snug text-slate-500">{interestCopy.onboardingDescription}</p>
            </div>
            <div className="flex h-12 min-w-0 items-center gap-2.5 rounded-[16px] border border-[#e6dfd2] bg-white px-3.5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <Search size={18} className="shrink-0 text-slate-400" />
              <input
                type="search"
                value={query}
                disabled={saving}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-slate-400"
                enterKeyHint="search"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-4">
          {priorityItems.length + otherItems.length === 0 ? (
            <div className="flex h-full min-h-[240px] items-center justify-center px-6 text-center text-sm text-slate-500">{copy.noResultsLabel}</div>
          ) : (
            <div className="space-y-5 py-4">
              {priorityItems.length > 0 ? (
                <div className="space-y-3">
                  <p className="px-1 text-[0.78rem] font-semibold uppercase tracking-wide text-slate-400">{copy.priorityLanguagesLabel}</p>
                  <div className="space-y-3">{priorityItems.map(renderRow)}</div>
                </div>
              ) : null}
              {otherItems.length > 0 ? (
                <div className="space-y-3">
                  {priorityItems.length > 0 ? <p className="px-1 text-[0.78rem] font-semibold uppercase tracking-wide text-slate-400">{copy.allLanguagesLabel}</p> : null}
                  <div className="space-y-3">{otherItems.map(renderRow)}</div>
                </div>
              ) : null}
            </div>
          )}
        </div>
        <footer className="shrink-0 border-t border-gray-100 bg-[#fcfbf8] px-4 pt-3" style={{ paddingBottom: "max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px))" }}>
          {code ? (
            <div className="flex flex-col items-center gap-1 pb-3">
              <p className="text-[0.82rem] font-semibold text-slate-600">{interestCopy.levelQuestion}</p>
              <LanguageLevelPicker level={level} locale={locale} onChange={setLevel} disabled={saving} />
            </div>
          ) : null}
          {error ? <p className="pb-2 text-center text-[0.82rem] text-rose-600" role="alert">{interestCopy.saveError}</p> : null}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !code}
            aria-busy={saving}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-amber-500 text-[0.95rem] font-semibold text-white shadow-[0_16px_32px_rgba(245,158,11,0.28)] transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:opacity-70 disabled:shadow-none"
          >
            {saving ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
            {interestCopy.saveAction}
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
