export type ConnectSearchRestoreDecision = {
  shouldRunSearch: boolean;
  nextPendingQuery: string | null;
  nextSkipInitialEffect: boolean;
  activeQuery: string | null;
};

type ConnectSearchRestoreInput = {
  normalizedQuery: string;
  pendingQuery: string | null;
  skipInitialEffect: boolean;
};

export function resolveConnectSearchRestore({
  normalizedQuery,
  pendingQuery,
  skipInitialEffect,
}: ConnectSearchRestoreInput): ConnectSearchRestoreDecision {
  if (skipInitialEffect) {
    return {
      shouldRunSearch: false,
      nextPendingQuery: pendingQuery,
      nextSkipInitialEffect: false,
      activeQuery: pendingQuery ?? normalizedQuery,
    };
  }

  if (pendingQuery !== null) {
    const matchesRestoredSnapshot = pendingQuery === normalizedQuery;

    return {
      shouldRunSearch: !matchesRestoredSnapshot,
      nextPendingQuery: null,
      nextSkipInitialEffect: false,
      activeQuery: matchesRestoredSnapshot ? normalizedQuery : null,
    };
  }

  return {
    shouldRunSearch: true,
    nextPendingQuery: null,
    nextSkipInitialEffect: false,
    activeQuery: null,
  };
}
