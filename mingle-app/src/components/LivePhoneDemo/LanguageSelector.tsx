"use client";

import { ChevronLeft, Search } from "lucide-react";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  buildRecentLanguageChipCodes,
  buildLanguageSelectorItems,
  filterLanguageSelectorItems,
  registerDeselectedLanguageCode,
  sanitizeRecentLanguageCodes,
  resolveDefaultLanguageSelectorSortMode,
  resolveLanguageSelectorLocale,
  syncDeselectedLanguageCodes,
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
  const recentStripRef = useRef<HTMLDivElement | null>(null);
  const recentChipRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingRecentChipVisibilityCodeRef = useRef<string | null>(null);
  const searchFieldRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const selectedLanguagesRef = useRef<string[]>(selectedLanguages);
  const [query, setQuery] = useState("");
  const [recentLanguageCodes, setRecentLanguageCodes] = useState<string[]>(() =>
    readRecentLanguageCodes(),
  );
  const localeInfo = useMemo(() => resolveLanguageSelectorLocale(uiLocale), [uiLocale]);
  const defaultSortMode = useMemo(
    () => resolveDefaultLanguageSelectorSortMode(localeInfo.source),
    [localeInfo.source],
  );
  const showSortToggle = copy.languageSelectorSortLocaleLabel !== "A-Z";
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
    return buildRecentLanguageChipCodes(selectedLanguages, recentLanguageCodes)
      .map((code) => itemMap.get(code))
      .filter((item): item is (typeof languageItems)[number] => Boolean(item));
  }, [languageItems, recentLanguageCodes, selectedLanguages]);

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
  const setRecentChipRef = useCallback((code: string, node: HTMLButtonElement | null) => {
    if (!node) {
      recentChipRefs.current.delete(code);
      return;
    }

    recentChipRefs.current.set(code, node);
  }, []);
  const keepRecentChipVisible = useCallback((code: string) => {
    const strip = recentStripRef.current;
    const chip = recentChipRefs.current.get(code);
    if (!strip || !chip) return;

    const stripRect = strip.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    const edgePadding = 12;

    if (chipRect.left < stripRect.left + edgePadding) {
      strip.scrollLeft -= (stripRect.left + edgePadding) - chipRect.left;
      return;
    }

    if (chipRect.right > stripRect.right - edgePadding) {
      strip.scrollLeft += chipRect.right - (stripRect.right - edgePadding);
    }
  }, []);
  const atMax = selectedLanguages.length >= MAX_LANGS;
  const atMin = selectedLanguages.length <= MIN_LANGS;

  useEffect(() => {
    selectedLanguagesRef.current = selectedLanguages;
  }, [selectedLanguages]);

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
    if (!showSortToggle) {
      setSortMode(defaultSortMode);
    }
  }, [defaultSortMode, showSortToggle]);

  useEffect(() => {
    setRecentLanguageCodes((currentCodes) =>
      syncDeselectedLanguageCodes(selectedLanguages, currentCodes),
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
    const pendingCode = pendingRecentChipVisibilityCodeRef.current;
    if (!pendingCode || typeof window === "undefined") return;

    const rafId = window.requestAnimationFrame(() => {
      keepRecentChipVisible(pendingCode);
      pendingRecentChipVisibilityCodeRef.current = null;
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [keepRecentChipVisible, recentLanguageItems, selectedLanguages]);

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
    pendingRecentChipVisibilityCodeRef.current = code;
    const currentSelectedLanguages = selectedLanguagesRef.current;
    const isSelected = currentSelectedLanguages.includes(code);
    const isDisabled =
      disabled
      || (!isSelected && currentSelectedLanguages.length >= MAX_LANGS)
      || (isSelected && currentSelectedLanguages.length <= MIN_LANGS);
    if (isDisabled) return;

    const nextSelectedLanguages = isSelected
      ? currentSelectedLanguages.filter((languageCode) => languageCode !== code)
      : [...currentSelectedLanguages, code];
    selectedLanguagesRef.current = nextSelectedLanguages;

    if (isSelected) {
      setRecentLanguageCodes((currentCodes) =>
        registerDeselectedLanguageCode(code, currentCodes),
      );
    } else {
      setRecentLanguageCodes((currentCodes) =>
        syncDeselectedLanguageCodes(nextSelectedLanguages, currentCodes),
      );
    }

    onToggleLanguage(code);
  }, [disabled, onToggleLanguage]);

  const dismissSearchFocus = useCallback((target: EventTarget | null) => {
    const activeElement = document.activeElement;
    if (!searchInputRef.current || activeElement !== searchInputRef.current) return;
    if (target instanceof Node && searchFieldRef.current?.contains(target)) return;
    searchInputRef.current.blur();
  }, []);

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
        onPointerDownCapture={(event) => {
          dismissSearchFocus(event.target);
        }}
        onTouchStartCapture={(event) => {
          dismissSearchFocus(event.target);
        }}
      >
        <header className="shrink-0 border-b border-gray-100 bg-[#fcfbf8]">
          <div
            aria-hidden="true"
            style={{ height: "env(safe-area-inset-top, 0px)" }}
          />
          <div className="relative flex h-14 items-center justify-between gap-3 px-4">
            <button
              type="button"
              onClick={requestClose}
              className="inline-flex h-[38px] min-w-[40px] shrink-0 items-center justify-center px-1 text-gray-700 transition-colors hover:text-gray-900 active:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              aria-label={copy.backButtonLabel}
            >
              <ChevronLeft size={24} strokeWidth={2.4} />
            </button>
            <p
              id={titleId}
              className="pointer-events-none absolute left-1/2 top-1/2 w-[calc(100%-136px)] -translate-x-1/2 -translate-y-1/2 truncate text-center text-[1rem] font-semibold tracking-[-0.02em] text-slate-950"
            >
              {copy.languageSelectorTitle}
            </p>
            <div className="inline-flex h-[38px] min-w-[40px] shrink-0 items-center justify-end text-[0.92rem] font-semibold tracking-[-0.01em] text-slate-500">
              {selectedLanguages.length}/{MAX_LANGS}
            </div>
          </div>

          <div className="space-y-5 px-4 pb-5 pt-1">
            {recentLanguageItems.length > 0 ? (
              <div
                ref={recentStripRef}
                className="-mx-1 overflow-x-auto pb-1 no-scrollbar"
              >
                <div className="flex min-w-max items-center gap-2 px-1">
                  {recentLanguageItems.map((lang) => {
                    const isSelected = selectedLanguages.includes(lang.code);
                    const isDisabled =
                      disabled || (!isSelected && atMax) || (isSelected && atMin);

                    return (
                      <button
                        ref={(node) => {
                          setRecentChipRef(lang.code, node);
                        }}
                        key={lang.code}
                        type="button"
                        onClick={() => handleToggleRequest(lang.code)}
                        disabled={isDisabled}
                        aria-pressed={isSelected}
                        aria-label={`${lang.localizedName} · ${lang.secondaryLabel}`}
                        title={`${lang.localizedName} · ${lang.secondaryLabel}`}
                        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition ${
                          isSelected
                            ? "border-2 border-amber-400 bg-white shadow-[0_14px_28px_rgba(245,158,11,0.14)]"
                            : "border border-[#e4ded3] bg-[#f5f2ec] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]"
                        } ${
                          isDisabled
                            ? "cursor-not-allowed opacity-50"
                            : isSelected
                              ? "hover:-translate-y-[1px] hover:shadow-[0_16px_30px_rgba(245,158,11,0.18)]"
                              : "hover:-translate-y-[1px] hover:border-slate-300 hover:shadow-[0_14px_26px_rgba(15,23,42,0.08)]"
                        }`}
                      >
                        <span
                          className={`text-[2rem] leading-none ${
                            isSelected ? "" : "opacity-70"
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
                ref={searchFieldRef}
                className="flex h-12 min-w-0 items-center gap-2.5 rounded-[16px] border border-[#e6dfd2] bg-white px-3.5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]"
                style={{ flex: showSortToggle ? "1 1 0" : "1 1 100%" }}
              >
                <Search size={18} className="shrink-0 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={copy.languageSelectorSearchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-slate-400"
                  enterKeyHint="search"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>

              {showSortToggle ? (
                <div
                  className="min-w-0 rounded-[16px] border border-[#e6dfd2] bg-[#f3eee4] p-1 shadow-[0_8px_24px_rgba(15,23,42,0.05)]"
                  style={{ flex: "1 1 0" }}
                >
                  <div className="flex h-full items-stretch gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSortMode("locale");
                      }}
                      className={`flex-1 rounded-[12px] px-2 text-[0.8rem] font-semibold transition sm:text-[0.84rem] ${
                        sortMode === "locale"
                          ? "bg-white text-slate-950 shadow-[0_10px_20px_rgba(15,23,42,0.08)]"
                          : "text-slate-500 hover:text-slate-900"
                      }`}
                      aria-pressed={sortMode === "locale"}
                    >
                      {copy.languageSelectorSortLocaleLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSortMode("alphabetical");
                      }}
                      className={`flex-1 rounded-[12px] px-2 text-[0.8rem] font-semibold transition sm:text-[0.84rem] ${
                        sortMode === "alphabetical"
                          ? "bg-white text-slate-950 shadow-[0_10px_20px_rgba(15,23,42,0.08)]"
                          : "text-slate-500 hover:text-slate-900"
                      }`}
                      aria-pressed={sortMode === "alphabetical"}
                    >
                      {copy.languageSelectorSortAlphabeticalLabel}
                    </button>
                  </div>
                </div>
              ) : null}
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
                        ? "border-amber-400 bg-amber-50/95 shadow-[0_16px_32px_rgba(245,158,11,0.12)]"
                        : "border-[#ece6db] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.05)]"
                    } ${
                      isDisabled && !isSelected
                        ? "cursor-not-allowed opacity-45"
                      : isDisabled && isSelected
                        ? "cursor-not-allowed opacity-80"
                          : isSelected
                            ? "hover:-translate-y-[1px] hover:shadow-[0_18px_38px_rgba(245,158,11,0.14)]"
                            : "hover:-translate-y-[1px] hover:border-slate-300 hover:shadow-[0_18px_36px_rgba(15,23,42,0.08)]"
                    }`}
                  >
                    <span
                      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border shadow-sm ${
                        isSelected
                          ? "border-amber-300 bg-white shadow-[0_6px_14px_rgba(245,158,11,0.08)]"
                          : "border-[#e5dfd5] bg-[#faf7f1]"
                      }`}
                    >
                      <span className="text-[2rem] leading-none">{lang.flag}</span>
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
