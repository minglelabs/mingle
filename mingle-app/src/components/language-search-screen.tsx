"use client";

import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import LanguagePreferencePicker from "@/components/language-preference-picker";
import SlideSurface from "@/components/slide-surface";
import { resolveLivePhoneDemoRoomManagementCopy } from "@/components/LivePhoneDemo/live-phone-demo.room-management-copy";
import { searchCopy } from "@/i18n/search-copy";
import { resolveLanguageSearchCopy } from "@/i18n/more-languages-copy";

/**
 * The full-screen language search (owner, 2026-11-25): the "..." after the
 * language flags of a post or a bio opens it to read the text in any other
 * language. Slides in from the right and goes back with the back button or a
 * left-edge swipe, like every other layered screen. Picking a language closes it.
 */
export default function LanguageSearchScreen({
  open,
  locale,
  onClose,
  onPick,
}: {
  open: boolean;
  locale: string;
  onClose: () => void;
  onPick: (language: string) => void;
}) {
  const copy = useMemo(() => resolveLivePhoneDemoRoomManagementCopy(locale), [locale]);
  const title = useMemo(() => resolveLanguageSearchCopy(locale), [locale]);
  const backLabel = useMemo(() => searchCopy(locale).back, [locale]);
  // Outside the card it was opened from (a card is clipped and may be transformed).
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setHost(document.body), 0);
    return () => window.clearTimeout(timer);
  }, []);
  if (!host) return null;
  return createPortal(
    <SlideSurface
      open={open}
      ariaLabel={title}
      onClose={onClose}
      zIndex={260}
      nativeBackPriority={60}
      style={{ touchAction: "pan-y" }}
      // A tap in here must not reach the post card underneath.
      stopPropagation
    >
      <header
        className="flex shrink-0 items-center gap-1 border-b border-gray-100 bg-white px-2 pb-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
      >
        <button
          type="button"
          data-qa="language-search-back"
          onClick={onClose}
          aria-label={backLabel}
          className="flex h-11 w-11 items-center justify-center rounded-full text-slate-800 active:bg-gray-100"
        >
          <ChevronLeft size={26} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-[18px] font-bold text-slate-950">{title}</h1>
      </header>
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
        data-qa="language-search-screen"
      >
        {open ? (
          <LanguagePreferencePicker
            selectedLanguages={[]}
            onToggleLanguage={(code) => onPick(code)}
            uiLocale={locale}
            searchPlaceholder={copy.languageSelectorSearchPlaceholder}
            sortLocaleLabel={copy.languageSelectorSortLocaleLabel}
            sortAlphabeticalLabel={copy.languageSelectorSortAlphabeticalLabel}
            noResultsLabel={copy.languageSelectorNoResultsLabel}
            maxLanguages={1}
            minLanguages={0}
            hideSelection
          />
        ) : null}
      </div>
    </SlideSurface>,
    host,
  );
}
