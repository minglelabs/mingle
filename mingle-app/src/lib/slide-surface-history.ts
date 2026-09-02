export type SlideSurfaceHistoryEntry = {
  scope: string;
  id: string;
  value?: string;
};

export const SLIDE_SURFACE_HISTORY_KEY = "__mingle_slide_surface_history";

type HistoryState = Record<string, unknown>;

function isHistoryState(value: unknown): value is HistoryState {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSlideSurfaceHistoryEntry(value: unknown): value is SlideSurfaceHistoryEntry {
  if (!isHistoryState(value)) return false;
  return typeof value.scope === "string" && typeof value.id === "string";
}

export function readSlideSurfaceHistory(state?: unknown): SlideSurfaceHistoryEntry[] {
  if (!isHistoryState(state)) return [];
  const entries = state[SLIDE_SURFACE_HISTORY_KEY];
  if (!Array.isArray(entries)) return [];
  return entries.filter(isSlideSurfaceHistoryEntry).map((entry) => ({
    scope: entry.scope,
    id: entry.id,
    ...(typeof entry.value === "string" ? { value: entry.value } : {}),
  }));
}

export function readSlideSurfaceHistoryForScope(
  scope: string,
  state?: unknown,
): SlideSurfaceHistoryEntry[] {
  return readSlideSurfaceHistory(
    state ?? (typeof window === "undefined" ? null : window.history.state),
  ).filter((entry) => entry.scope === scope);
}

export function pushSlideSurfaceHistory(entry: SlideSurfaceHistoryEntry): void {
  if (typeof window === "undefined") return;

  const currentState = isHistoryState(window.history.state) ? window.history.state : {};
  window.history.pushState(
    {
      ...currentState,
      [SLIDE_SURFACE_HISTORY_KEY]: [
        ...readSlideSurfaceHistory(currentState),
        entry,
      ],
    },
    "",
  );
}

export function replaceSlideSurfaceHistory(entries: SlideSurfaceHistoryEntry[]): void {
  if (typeof window === "undefined") return;

  const currentState = isHistoryState(window.history.state) ? window.history.state : {};
  window.history.replaceState(
    {
      ...currentState,
      [SLIDE_SURFACE_HISTORY_KEY]: entries,
    },
    "",
  );
}

/**
 * Consume the current browser history entry and resolve only after the
 * resulting popstate has had time to settle in React. This is used when a
 * surface action starts another route: the parent surface must be removed
 * before the route entry is pushed, otherwise separate history owners can
 * replay stale state on iOS.
 */
export function consumeCurrentHistoryEntry(
  isEntryPresent: () => boolean,
): Promise<boolean> {
  if (typeof window === "undefined" || !isEntryPresent()) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId: number | null = null;
    let settleFrameId: number | null = null;
    let settleFrameCount = 0;

    const scheduleFrame = (callback: () => void) => {
      if (typeof window.requestAnimationFrame === "function") {
        return window.requestAnimationFrame(callback);
      }
      return window.setTimeout(callback, 0);
    };

    const finish = (consumed: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("popstate", handlePopState);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (settleFrameId !== null) {
        if (typeof window.cancelAnimationFrame === "function") {
          window.cancelAnimationFrame(settleFrameId);
        } else {
          window.clearTimeout(settleFrameId);
        }
      }
      resolve(consumed);
    };

    const checkSettled = () => {
      settleFrameId = null;
      if (settled) return;
      if (isEntryPresent()) {
        settleFrameCount = 0;
        return;
      }
      settleFrameCount += 1;
      if (settleFrameCount >= 2) {
        finish(true);
        return;
      }
      settleFrameId = scheduleFrame(checkSettled);
    };

    const scheduleSettledCheck = () => {
      if (settled || settleFrameId !== null) return;
      settleFrameCount = 0;
      settleFrameId = scheduleFrame(checkSettled);
    };

    function handlePopState() {
      scheduleSettledCheck();
    }

    window.addEventListener("popstate", handlePopState);
    timeoutId = window.setTimeout(() => {
      finish(!isEntryPresent());
    }, 2000);

    try {
      window.history.back();
      scheduleSettledCheck();
    } catch {
      finish(false);
    }
  });
}

export function consumeTopSlideSurfaceHistoryEntry(
  entry: SlideSurfaceHistoryEntry,
): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);

  const currentEntries = readSlideSurfaceHistory(window.history.state);
  const currentEntry = currentEntries[currentEntries.length - 1];
  const matchesEntry = (candidate: SlideSurfaceHistoryEntry | undefined) => (
    candidate?.scope === entry.scope
    && candidate.id === entry.id
    && (entry.value === undefined || candidate.value === entry.value)
  );

  if (!matchesEntry(currentEntry)) return Promise.resolve(false);

  return consumeCurrentHistoryEntry(() => {
    const nextEntries = readSlideSurfaceHistory(window.history.state);
    return matchesEntry(nextEntries[nextEntries.length - 1]);
  });
}

/**
 * Consume every currently stacked surface owned by one parent screen. A
 * profile can be opened above a participant list or another surface, so
 * consuming only the profile entry would leave an old parent in the history
 * stack when the action starts a conversation.
 */
export async function consumeSlideSurfaceHistoryForScope(scope: string): Promise<boolean> {
  const maxEntries = 32;

  for (let index = 0; index < maxEntries; index += 1) {
    const entries = readSlideSurfaceHistoryForScope(scope);
    const topEntry = entries[entries.length - 1];
    if (!topEntry) return true;

    const consumed = await consumeTopSlideSurfaceHistoryEntry(topEntry);
    if (!consumed) return false;
  }

  return readSlideSurfaceHistoryForScope(scope).length === 0;
}
