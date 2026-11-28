/**
 * A voice room is always in a voice talk (owner, 2026-11-25): entering the
 * lounge or a live room from the voice-room tab joins the room's call at once
 * (starting it when nobody is in it), with no "start a voice talk?" question.
 * The same room opened from the chat list is an ordinary open, so nobody is
 * put in a call by scrolling back to an old room.
 *
 * The tab marks the room it is about to open; the room screen takes the mark
 * once when it mounts for that room.
 */
const KEY = "mingle.voice-room.entry";
/** A mark older than this was never used (the room failed to open): ignored. */
export const VOICE_ROOM_ENTRY_TTL_MS = 60_000;

type Entry = { conversationId: string; at: number };

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function parseVoiceRoomEntry(raw: string | null, conversationId: string, now: number): boolean {
  if (!raw) return false;
  try {
    const entry = JSON.parse(raw) as Partial<Entry> | null;
    if (!entry || entry.conversationId !== conversationId || typeof entry.at !== "number") return false;
    return now - entry.at >= 0 && now - entry.at <= VOICE_ROOM_ENTRY_TTL_MS;
  } catch {
    return false;
  }
}

/** Called by the voice-room tab right before it opens a room. */
export function markVoiceRoomEntry(conversationId: string): void {
  try {
    storage()?.setItem(KEY, JSON.stringify({ conversationId, at: Date.now() } satisfies Entry));
  } catch {
    // No storage: the room opens without joining; the voice button still works.
  }
}

/** True once for the room the tab just opened; the mark is used up. */
export function takeVoiceRoomEntry(conversationId: string): boolean {
  const store = storage();
  if (!store) return false;
  try {
    const raw = store.getItem(KEY);
    if (!parseVoiceRoomEntry(raw, conversationId, Date.now())) return false;
    store.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
