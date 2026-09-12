import {
  buildLanguageSelectorHistoryState,
  clearLanguageSelectorHistoryState,
  isLanguageSelectorHistoryOpen,
} from "./language-selector.logic";

export type LanguageSelectorCloseOptions = {
  syncHistory?: "back" | "replace" | "none";
};

type SelectorHistory = {
  read: () => unknown;
  push: (state: Record<string, unknown>) => void;
  replace: (state: Record<string, unknown>) => void;
  back: () => void;
  locationKey: () => string;
};

// Browser back is asynchronous, even for same-URL overlay entries. Keep the
// user's latest intent separate from the traversal still in flight. In
// particular, a late close must not undo a subsequent tap on the open button.
export function createLanguageSelectorNavigation({
  owner,
  history,
  onOpenChange,
}: {
  owner: string;
  history: SelectorHistory;
  onOpenChange: (open: boolean) => void;
}) {
  let active = false;
  let open = false;
  let pendingBackLocation: string | null = null;

  const applyOpen = (nextOpen: boolean) => {
    if (open === nextOpen) return;
    open = nextOpen;
    onOpenChange(nextOpen);
  };

  const ensureOpenEntry = () => {
    if (isLanguageSelectorHistoryOpen(history.read(), owner)) return;
    history.push(buildLanguageSelectorHistoryState(history.read(), owner));
  };

  const clearOwnEntry = () => {
    if (!isLanguageSelectorHistoryOpen(history.read(), owner)) return;
    history.replace(clearLanguageSelectorHistoryState(history.read()));
  };

  const close = ({ syncHistory = "none" }: LanguageSelectorCloseOptions = {}) => {
    applyOpen(false);
    // Never issue two back traversals for the same selector entry.
    if (pendingBackLocation !== null) return;
    if (!isLanguageSelectorHistoryOpen(history.read(), owner)) return;
    if (syncHistory === "back") {
      pendingBackLocation = history.locationKey();
      history.back();
    } else if (syncHistory === "replace") {
      clearOwnEntry();
    }
  };

  return {
    open() {
      if (!active) return;
      // Opening is idempotent; queued clicks must not toggle the screen shut.
      applyOpen(true);
      if (pendingBackLocation === null) ensureOpenEntry();
    },
    close,
    setActive(nextActive: boolean) {
      active = nextActive;
      if (!active) close({ syncHistory: "replace" });
      // Synchronize React when this instance replaces a previous room owner.
      onOpenChange(open);
    },
    handlePopState(state: unknown) {
      if (pendingBackLocation !== null) {
        const returnLocation = pendingBackLocation;
        pendingBackLocation = null;
        if (active && open && history.locationKey() === returnLocation) {
          // The old entry has now been consumed. Give the reopened selector
          // exactly one fresh entry, without navigating away from this room.
          ensureOpenEntry();
          return;
        }
        applyOpen(false);
        return;
      }
      if (!active) return;
      applyOpen(isLanguageSelectorHistoryOpen(state, owner));
    },
    dispose() {
      active = false;
      open = false;
      pendingBackLocation = null;
      // A hidden/running room must not clear another room's selector entry.
      clearOwnEntry();
    },
  };
}
