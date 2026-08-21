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
