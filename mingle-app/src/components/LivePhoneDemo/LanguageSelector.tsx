"use client";

import { Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type RefObject,
} from "react";
import {
  buildLanguageSelectorItems,
  bumpRecentLanguageCode,
  filterLanguageSelectorItems,
  hydrateRecentLanguageCodes,
  sanitizeRecentLanguageCodes,
  resolveDefaultLanguageSelectorSortMode,
  resolveLanguageSelectorLocale,
  sortLanguageSelectorItems,
  type LanguageSelectorSortMode,
} from "@/components/LivePhoneDemo/language-selector.logic";
import type { LivePhoneDemoRoomManagementCopy } from "@/components/LivePhoneDemo/live-phone-demo.room-management-copy";

const MAX_LANGS = 5;
const MIN_LANGS = 1;
const RECENT_LANGUAGE_CODES_STORAGE_KEY =
  "mingle_live_phone_demo_recent_language_selector_codes_v1";

function readRecentLanguageCodes(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const rawValue = window.localStorage.getItem(RECENT_LANGUAGE_CODES_STORAGE_KEY);
    if (!rawValue) return [];
    return sanitizeRecentLanguageCodes(JSON.parse(rawValue));
  } catch {
    return [];
  }
}

interface LanguageSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLanguages: string[];
  onToggleLanguage: (code: string) => void;
  uiLocale?: string;
  copy: LivePhoneDemoRoomManagementCopy;
  disabled?: boolean;
  triggerRef?: RefObject<HTMLElement | null>;
}

export default function LanguageSelector({
  isOpen,
  onClose,
  selectedLanguages,
  onToggleLanguage,
  uiLocale,
  copy,
  disabled,
  triggerRef,
}: LanguageSelectorProps) {
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [recentLanguageCodes, setRecentLanguageCodes] = useState<string[]>(() =>
    readRecentLanguageCodes(),
  );
  const localeInfo = useMemo(() => resolveLanguageSelectorLocale(uiLocale), [uiLocale]);
  const defaultSortMode = useMemo(
    () => resolveDefaultLanguageSelectorSortMode(localeInfo.source),
    [localeInfo.source],
  );
  const [sortMode, setSortMode] = useState<LanguageSelectorSortMode>(defaultSortMode);
  const languageItems = useMemo(
    () => buildLanguageSelectorItems(localeInfo.locale),
    [localeInfo.locale],
  );
  const filteredItems = useMemo(() => {
    const visibleItems = filterLanguageSelectorItems(languageItems, query);
    return sortLanguageSelectorItems(visibleItems, sortMode, localeInfo.locale);
  }, [languageItems, localeInfo.locale, query, sortMode]);
  const recentLanguageItems = useMemo(() => {
    const itemMap = new Map<string, (typeof languageItems)[number]>(
      languageItems.map((item) => [item.code, item]),
    );
    return recentLanguageCodes
      .map((code) => itemMap.get(code))
      .filter((item): item is (typeof languageItems)[number] => Boolean(item));
  }, [languageItems, recentLanguageCodes]);

  const focusTrigger = useCallback(() => {
    window.setTimeout(() => {
      try {
        triggerRef?.current?.focus({ preventScroll: true });
      } catch {
        triggerRef?.current?.focus();
      }
    }, 0);
  }, [triggerRef]);

  const requestClose = useCallback(() => {
    onClose();
    focusTrigger();
  }, [focusTrigger, onClose]);
  const atMax = selectedLanguages.length >= MAX_LANGS;
  const atMin = selectedLanguages.length <= MIN_LANGS;

  useEffect(() => {
    if (!isOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    setSortMode(defaultSortMode);
  }, [defaultSortMode]);

  useEffect(() => {
    setRecentLanguageCodes((currentCodes) =>
      hydrateRecentLanguageCodes(selectedLanguages, currentCodes),
    );
  }, [selectedLanguages]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(
        RECENT_LANGUAGE_CODES_STORAGE_KEY,
        JSON.stringify(recentLanguageCodes),
      );
    } catch {
      // Ignore storage failures for the recent-language chip strip.
    }
  }, [recentLanguageCodes]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      requestClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, requestClose]);

  const handleToggleRequest = useCallback((code: string) => {
    const isSelected = selectedLanguages.includes(code);
    const isDisabled =
      disabled || (!isSelected && atMax) || (isSelected && atMin);
    if (isDisabled) return;

    if (!isSelected) {
      setRecentLanguageCodes((currentCodes) =>
        bumpRecentLanguageCode(code, currentCodes),
      );
    }

    onToggleLanguage(code);
  }, [atMax, atMin, disabled, onToggleLanguage, selectedLanguages]);

  if (!isOpen || typeof document === "undefined") return null;

  // The active room itself is portaled above the conversation list, so this
  // selector must sit above that body-level room overlay as well.
  const overlay = (
    <div
      className="fixed inset-0 bg-[rgba(248,245,239,0.94)] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{ zIndex: 140 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          requestClose();
        }
      }}
    >
      <div
        className="mx-auto flex h-full w-full max-w-[540px] flex-col bg-[#fcfbf8] text-slate-950 shadow-[0_32px_80px_rgba(15,23,42,0.16)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-gray-100 bg-[#fcfbf8]">
          <div
            className="flex items-center justify-between gap-3 px-4"
            style={{
              paddingTop: "env(safe-area-inset-top, 0px)",
              height: "calc(56px + env(safe-area-inset-top, 0px))",
            }}
          >
            <div className="min-w-0 flex-1">
              <p
                id={titleId}
                className="truncate text-[1rem] font-semibold tracking-[-0.02em] text-slate-950"
              >
                {copy.languageSelectorTitle}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#f3eee4] px-2.5 py-1 text-[0.76rem] font-semibold text-slate-600">
                {selectedLanguages.length}/{MAX_LANGS}
              </span>
              <button
                type="button"
                onClick={requestClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition hover:bg-gray-100 hover:text-slate-950"
                aria-label={copy.languageSelectorCloseLabel}
              >
                <span className="sr-only">{copy.languageSelectorCloseLabel}</span>
                <X size={20} strokeWidth={2.2} />
              </button>
            </div>
          </div>

          <div className="space-y-4 px-4 pb-4">
            {recentLanguageItems.length > 0 ? (
              <div className="-mx-1 overflow-x-auto pb-1">
                <div className="flex min-w-max items-center gap-2 px-1">
                  {recentLanguageItems.map((lang) => {
                    const isSelected = selectedLanguages.includes(lang.code);
                    const isDisabled =
                      disabled || (!isSelected && atMax) || (isSelected && atMin);

                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => handleToggleRequest(lang.code)}
                        disabled={isDisabled}
                        aria-pressed={isSelected}
                        aria-label={`${lang.localizedName} · ${lang.secondaryLabel}`}
                        title={`${lang.localizedName} · ${lang.secondaryLabel}`}
                        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border transition ${
                          isSelected
                            ? "border-amber-300 bg-white shadow-[0_12px_24px_rgba(245,158,11,0.10)]"
                            : "border-[#e5dfd5] bg-[#f1ede6]"
                        } ${
                          isDisabled
                            ? "cursor-not-allowed opacity-50"
                            : "hover:-translate-y-[1px] hover:border-slate-300 hover:shadow-[0_14px_26px_rgba(15,23,42,0.08)]"
                        }`}
                      >
                        <span
                          className={`text-[2rem] leading-none ${
                            isSelected ? "" : "grayscale opacity-55"
                          }`}
                        >
                          {lang.flag}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="flex items-stretch gap-3">
              <div
                className="flex h-[52px] min-w-0 items-center gap-3 rounded-[1.15rem] border border-[#e6dfd2] bg-white px-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]"
                style={{ flex: "3 1 0" }}
              >
                <Search size={18} className="shrink-0 text-slate-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={copy.languageSelectorSearchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-400"
                  enterKeyHint="search"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>

              <div
                className="min-w-0 overflow-hidden rounded-[1.15rem] border border-[#e6dfd2] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.05)]"
                style={{ flex: "2 1 0" }}
              >
                <div className="flex h-[52px] items-stretch">
                  <button
                    type="button"
                    onClick={() => {
                      setSortMode("locale");
                    }}
                    className="flex-1 border-b-2 border-r border-[#ece6db] px-2 text-[0.78rem] font-semibold transition sm:text-[0.84rem]"
                    style={{
                      borderBottomColor: sortMode === "locale" ? "#111827" : "transparent",
                      color: sortMode === "locale" ? "#111827" : "#9CA3AF",
                    }}
                    aria-pressed={sortMode === "locale"}
                  >
                    {copy.languageSelectorSortLocaleLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSortMode("alphabetical");
                    }}
                    className="flex-1 border-b-2 px-2 text-[0.78rem] font-semibold transition sm:text-[0.84rem]"
                    style={{
                      borderBottomColor:
                        sortMode === "alphabetical" ? "#111827" : "transparent",
                      color: sortMode === "alphabetical" ? "#111827" : "#9CA3AF",
                    }}
                    aria-pressed={sortMode === "alphabetical"}
                  >
                    {copy.languageSelectorSortAlphabeticalLabel}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div
          className="flex-1 overflow-y-auto px-4"
          style={{
            paddingBottom: "max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px))",
          }}
        >
          {filteredItems.length === 0 ? (
            <div className="flex h-full min-h-[240px] items-center justify-center px-6 text-center text-sm text-slate-500">
              {copy.languageSelectorNoResultsLabel}
            </div>
          ) : (
            <div className="space-y-3 py-4">
              {filteredItems.map((lang) => {
                const isSelected = selectedLanguages.includes(lang.code);
                const isDisabled =
                  disabled || (!isSelected && atMax) || (isSelected && atMin);

                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => handleToggleRequest(lang.code)}
                    disabled={isDisabled}
                    className={`flex w-full items-center gap-4 rounded-[1.6rem] border px-4 py-3 text-left transition ${
                      isSelected
                        ? "border-amber-300 bg-amber-50/90 shadow-[0_14px_30px_rgba(245,158,11,0.10)]"
                        : "border-[#ece6db] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.05)]"
                    } ${
                      isDisabled && !isSelected
                        ? "cursor-not-allowed opacity-45"
                        : isDisabled && isSelected
                          ? "cursor-not-allowed opacity-80"
                          : "hover:-translate-y-[1px] hover:border-slate-300 hover:shadow-[0_18px_36px_rgba(15,23,42,0.08)]"
                    }`}
                  >
                    <span
                      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border shadow-sm ${
                        isSelected
                          ? "border-amber-200 bg-white"
                          : "border-[#e5dfd5] bg-[#faf7f1]"
                      }`}
                    >
                      <span className="text-[2rem] leading-none">{lang.flag}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[1rem] font-semibold tracking-[-0.01em] text-slate-950">
                        {lang.localizedName}
                      </span>
                      <span className="mt-1 block truncate text-[0.82rem] text-slate-500">
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
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className={`h-4 w-4 ${
                          isSelected ? "text-white" : "text-transparent"
                        }`}
                        fill="none"
                      >
                        <path
                          d="M5.5 12.5L10 17L18.5 8.5"
                          stroke="currentColor"
                          strokeWidth="3.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
  return createPortal(overlay, document.body);
}
