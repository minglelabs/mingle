/**
 * Pure decision logic for the unified search input, extracted so the tricky
 * seams — 300ms debounce, Hangul (IME) composition guard, and out-of-order
 * response protection — are unit-tested without React or a DOM.
 *
 * The component owns the timers and fetches; this module only answers
 * yes/no/what-sequence questions about them.
 */

export const SEARCH_DEBOUNCE_MS = 300;

export type SearchDispatchInput = {
  /** Trimmed query the user has typed. */
  query: string;
  /** True between compositionstart and compositionend (Hangul/CJK IME). */
  isComposing: boolean;
};

/**
 * Whether a debounced search request should be issued for the current input.
 * A blank query clears results (handled by the caller) and never fetches; a
 * query mid-IME-composition must not fire until composition ends.
 */
export function shouldDispatchSearch({ query, isComposing }: SearchDispatchInput): boolean {
  if (isComposing) return false;
  return query.trim().length >= 1;
}

/**
 * Guard against a late response overwriting a newer one: a response is only
 * applied when it belongs to the request that is still the latest AND still
 * matches the query the user is currently looking at.
 */
export function shouldApplyResponse(args: {
  responseSequence: number;
  latestSequence: number;
  responseQuery: string;
  activeQuery: string;
}): boolean {
  return args.responseSequence === args.latestSequence
    && args.responseQuery === args.activeQuery;
}

export type ResultsRetentionInput = {
  /** The query whose results are on screen right now. */
  currentResultsQuery: string;
  /** The query being searched for (the new one). */
  pendingQuery: string;
  /** Whether any results are currently displayed. */
  hasCurrentResults: boolean;
};

export type ResultsRetentionDecision = {
  /** Keep the existing results visible while the new search runs. */
  keepCurrentResults: boolean;
  /** Show the small near-field spinner (never a full skeleton). */
  showInlineLoading: boolean;
  /** Clear the results area to empty (first search / re-search with none). */
  clearResults: boolean;
};

/**
 * While a new query loads: keep the old results and show a small inline loader
 * when there ARE old results; otherwise leave the area empty (no skeleton, no
 * full-screen loader), per the spec.
 */
export function resolveResultsRetention({
  hasCurrentResults,
}: ResultsRetentionInput): ResultsRetentionDecision {
  if (hasCurrentResults) {
    return { keepCurrentResults: true, showInlineLoading: true, clearResults: false };
  }
  return { keepCurrentResults: false, showInlineLoading: true, clearResults: true };
}
