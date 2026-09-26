"use client";

import type { getConversationDictionary } from "@/i18n/conversations";
import { Search } from "lucide-react";

type ConversationDictionary = ReturnType<typeof getConversationDictionary>;

export type ConversationSearchBarLabels = {
  /** Placeholder text shown inside the bar. */
  placeholder: string;
  /** Accessible name for the bar (screen readers announce it as a search entry). */
  accessibleName: string;
};

/**
 * Resolve the search bar's visible placeholder and accessible name from the
 * existing conversation dictionary — no new copy is introduced, so all 15
 * languages come from `searchPlaceholder` / `searchButtonLabel`, the same
 * strings the previous header search button used. `placeholder` falls back to
 * `searchButtonLabel` if a locale ever lacks a placeholder.
 */
export function resolveConversationSearchBarLabels(
  copy: ConversationDictionary,
): ConversationSearchBarLabels {
  const accessibleName = copy.searchButtonLabel;
  const placeholder = copy.searchPlaceholder || accessibleName;
  return { placeholder, accessibleName };
}

type ConversationSearchBarProps = {
  copy: ConversationDictionary;
  /** Opens the shared conversation SearchOverlay — the exact handler the old header button used. */
  onOpen: () => void;
};

/**
 * The search entry for a posting-feed client's conversation list. It sits as
 * the first element inside the list scroll area (so it scrolls away with the
 * list) while the top header stays the shared AppTopHeader shared with the feed.
 *
 * It is an entry point, not a second search implementation: activating it opens
 * the existing full SearchOverlay, which already owns the query state, the
 * conversation filter, the results rows, the empty-result copy, recent-search
 * analytics, the clear affordance, IME composition handling and keyboard
 * dismissal. Behaviour is therefore identical to the old header search button,
 * which called the very same handler.
 */
export default function ConversationSearchBar({ copy, onOpen }: ConversationSearchBarProps) {
  const { placeholder, accessibleName } = resolveConversationSearchBarLabels(copy);

  return (
    <div className="px-4 pb-1 pt-2">
      <button
        type="button"
        onClick={onOpen}
        aria-label={accessibleName}
        className="flex w-full items-center gap-2 rounded-xl bg-gray-100 px-3 py-2.5 text-left transition active:bg-gray-200"
      >
        <Search size={16} className="shrink-0 text-gray-400" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[15px] text-gray-400">{placeholder}</span>
      </button>
    </div>
  );
}
