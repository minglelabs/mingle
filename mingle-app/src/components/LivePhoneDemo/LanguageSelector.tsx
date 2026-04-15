"use client";

import { Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  buildLanguageSelectorItems,
  filterLanguageSelectorItems,
  resolveDefaultLanguageSelectorSortMode,
  resolveLanguageSelectorLocale,
  sortLanguageSelectorItems,
  type LanguageSelectorSortMode,
} from "@/components/LivePhoneDemo/language-selector.logic";
import type { LivePhoneDemoRoomManagementCopy } from "@/components/LivePhoneDemo/live-phone-demo.room-management-copy";

const MAX_LANGS = 5;
const MIN_LANGS = 1;

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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
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

  const focusSearchInput = useCallback(() => {
    const input = searchInputRef.current;
    if (!input) return;

    input.focus({ preventScroll: true });
    const cursorPosition = input.value.length;
    try {
      input.setSelectionRange(cursorPosition, cursorPosition);
    } catch {
      // Ignore selection failures on unsupported inputs.
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    focusSearchInput();
    const animationFrameId = window.requestAnimationFrame(() => {
      focusSearchInput();
    });
    const timeoutId = window.setTimeout(() => {
      focusSearchInput();
    }, 220);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(timeoutId);
    };
  }, [focusSearchInput, isOpen]);

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

  if (!isOpen || typeof document === "undefined") return null;

  const atMax = selectedLanguages.length >= MAX_LANGS;
  const atMin = selectedLanguages.length <= MIN_LANGS;
  // The active room itself is portaled above the conversation list, so this
  // selector must sit above that body-level room overlay as well.
  const overlay = (
    <div
      className="fixed inset-0 bg-[rgba(248,245,239,0.94)] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={copy.languageSelectorTitle}
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
        <header
          className="shrink-0 border-b border-[#e8e2d7] px-4 pb-4"
          style={{
            paddingTop: "max(16px, calc(env(safe-area-inset-top, 0px) + 8px))",
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[1.15rem] font-semibold tracking-[-0.02em] text-slate-950">
                {copy.languageSelectorTitle}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {selectedLanguages.length}/{MAX_LANGS}
              </p>
            </div>
            <button
              type="button"
              onClick={requestClose}
              className="inline-flex h-10 min-w-10 items-center justify-center rounded-full border border-[#ded6c7] bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
              aria-label={copy.languageSelectorCloseLabel}
            >
              <span className="sr-only">{copy.languageSelectorCloseLabel}</span>
              <X size={18} strokeWidth={2.2} />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-[1.35rem] border border-[#e6dfd2] bg-white px-4 py-3 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
            <Search size={18} className="shrink-0 text-slate-400" />
            <input
              ref={searchInputRef}
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

          <div className="mt-4 flex items-center gap-2 rounded-full bg-[#efe8db] p-1">
            <button
              type="button"
              onClick={() => {
                setSortMode("locale");
              }}
              className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition ${
                sortMode === "locale"
                  ? "bg-white text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.10)]"
                  : "text-slate-600 hover:text-slate-950"
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
              className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition ${
                sortMode === "alphabetical"
                  ? "bg-white text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.10)]"
                  : "text-slate-600 hover:text-slate-950"
              }`}
              aria-pressed={sortMode === "alphabetical"}
            >
              {copy.languageSelectorSortAlphabeticalLabel}
            </button>
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
                    onClick={() => !isDisabled && onToggleLanguage(lang.code)}
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
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                        isSelected
                          ? "border-amber-500 bg-amber-500 text-white"
                          : "border-slate-300 text-transparent"
                      }`}
                    >
                      ✓
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
