/**
 * What a feed card remembers across an unmount. Windowing (`feed-window.ts`)
 * unmounts the cards far from the screen, so what a reader expects to find
 * again when swiping back lives here, in the shell, instead of in the card:
 *
 * - by post id: the translate choice, the flag-chip language (with the other
 *   translations fetched for it) and the photo on screen in a multi-photo
 *   post. The expanded caption is kept the same way by the shell's
 *   `FeedPostViewState` map (which is also saved for a cold start).
 * - by appearance (the feed entry key): the "read" analytics progress, so a
 *   remount never sends the once-per-appearance event a second time.
 *
 * Only what the reader changed is stored. Anything absent follows the post's
 * payload, so a refreshed post (a translation that finished meanwhile) still
 * shows the new data.
 */

/** The reader's translate choice for the viewer's language. */
export type FeedTranslateChoice = {
  /** The translation shown or hidden (fetched on request, or the payload's own). */
  translatedText: string | null;
  showingTranslation: boolean;
};

export type FeedPostMemory = {
  translation?: FeedTranslateChoice;
  /** Flag chip picked for another finished translation; null = the default chips. */
  pickedLanguage?: string | null;
  /** Every finished translation, fetched on the first chip pick. */
  otherTranslations?: Record<string, string> | null;
  /** The photo on screen in a multi-photo post (0 = the first). */
  photoIndex?: number;
};

/** Progress of the once-per-appearance "read" analytics event. */
export type FeedReadProgress = {
  readReported: boolean;
  /** Foreground dwell on the expanded body so far. */
  readDwellMs: number;
};

export type FeedCardMemory = {
  post(postId: string): FeedPostMemory | null;
  /** Merge a changed choice into what is kept for `postId`. */
  rememberPost(postId: string, patch: FeedPostMemory): void;
  read(entryKey: string): FeedReadProgress | null;
  rememberRead(entryKey: string, progress: FeedReadProgress): void;
};

export function createFeedCardMemory(): FeedCardMemory {
  const posts = new Map<string, FeedPostMemory>();
  const reads = new Map<string, FeedReadProgress>();
  return {
    post(postId) {
      return posts.get(postId) ?? null;
    },
    rememberPost(postId, patch) {
      posts.set(postId, { ...posts.get(postId), ...patch });
    },
    read(entryKey) {
      return reads.get(entryKey) ?? null;
    },
    rememberRead(entryKey, progress) {
      // An appearance with nothing to carry over keeps no entry.
      if (!progress.readReported && !(progress.readDwellMs > 0)) {
        reads.delete(entryKey);
        return;
      }
      reads.set(entryKey, { readReported: progress.readReported, readDwellMs: Math.max(0, progress.readDwellMs) });
    },
  };
}
