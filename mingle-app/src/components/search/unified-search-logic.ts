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

// ---------------------------------------------------------------------------
// Input controller: debounce + IME composition guard (people AND posts)
// ---------------------------------------------------------------------------

export type SearchInputController = {
  /** Every input change (also fired mid-composition). */
  setValue: (value: string) => void;
  compositionStart: () => void;
  /**
   * Composition committed. Dispatches even when the committed value equals the
   * value already stored (React would not re-render for an identical value).
   */
  compositionEnd: (value: string) => void;
  /** Submit (Enter / search key): dispatch now, skipping the debounce. */
  flush: () => void;
  /** Seed the controller as if `value` were already searched (restore path). */
  prime: (value: string) => void;
  dispose: () => void;
  isComposing: () => boolean;
};

/**
 * One debounced query feeds BOTH the people search and the post grid, so the
 * post grid can never race ahead of the IME or the 300ms debounce. `onDispatch`
 * receives the trimmed query (`""` = cleared, dispatched immediately).
 */
export function createSearchInputController({
  onDispatch,
  debounceMs = SEARCH_DEBOUNCE_MS,
}: {
  onDispatch: (query: string) => void;
  debounceMs?: number;
}): SearchInputController {
  let value = "";
  let composing = false;
  let lastDispatched: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const dispatchNow = () => {
    cancel();
    const query = value.trim();
    if (composing) return;
    if (query === lastDispatched) return;
    lastDispatched = query;
    onDispatch(query);
  };
  const schedule = () => {
    cancel();
    const query = value.trim();
    if (!query) {
      // Clearing never waits and is allowed mid-composition teardown.
      if (lastDispatched !== "") {
        lastDispatched = "";
        onDispatch("");
      }
      return;
    }
    if (!shouldDispatchSearch({ query, isComposing: composing })) return;
    timer = setTimeout(dispatchNow, debounceMs);
  };

  return {
    setValue(next) {
      value = next;
      schedule();
    },
    compositionStart() {
      composing = true;
      cancel();
    },
    compositionEnd(next) {
      composing = false;
      value = next;
      schedule();
    },
    flush() {
      dispatchNow();
    },
    prime(next) {
      cancel();
      value = next;
      lastDispatched = next.trim();
    },
    dispose() {
      cancel();
    },
    isComposing: () => composing,
  };
}

// ---------------------------------------------------------------------------
// Recent-search recording
// ---------------------------------------------------------------------------

export type RecentSearchRecorder = {
  /** Tell the recorder which query currently has results on screen ("" = none). */
  setShownResults: (query: string, hasResults: boolean) => void;
  /** A result was tapped or the search was submitted. */
  commit: (query: string) => void;
  /** The user is leaving search: record the query whose results are showing. */
  commitOnLeave: () => void;
};

/**
 * Records a term only on intent — a result tap, a submit, or leaving the search
 * while results are shown — never on each debounced dispatch, so the partial
 * text typed on the way to a word is not saved.
 */
export function createRecentSearchRecorder({
  enabled,
  record,
}: {
  enabled: () => boolean;
  record: (query: string) => void;
}): RecentSearchRecorder {
  let shownQuery = "";
  let recorded = new Set<string>();
  const commit = (raw: string) => {
    const query = raw.trim();
    if (!query || !enabled() || recorded.has(query)) return;
    recorded = new Set(recorded).add(query);
    record(query);
  };
  return {
    setShownResults(query, hasResults) {
      shownQuery = hasResults ? query.trim() : "";
    },
    commit,
    commitOnLeave() {
      if (shownQuery) commit(shownQuery);
    },
  };
}

// ---------------------------------------------------------------------------
// Combined "no results"
// ---------------------------------------------------------------------------

/**
 * "No results" appears once the search for the visible query has settled on
 * both sides with nothing: people returned none (a people failure counts as
 * none) and the post grid is empty — including when the post request FAILED.
 */
export function shouldShowNoResults({
  query,
  dispatchedQuery,
  peopleSettledQuery,
  peopleCount,
  postsSettledEmpty,
}: {
  query: string;
  dispatchedQuery: string;
  peopleSettledQuery: string;
  peopleCount: number;
  /** Post grid finished (ready OR error) for `dispatchedQuery` and shows no tile. */
  postsSettledEmpty: boolean;
}): boolean {
  const current = query.trim();
  if (!current || current !== dispatchedQuery) return false;
  if (peopleSettledQuery !== dispatchedQuery) return false;
  return peopleCount === 0 && postsSettledEmpty;
}
