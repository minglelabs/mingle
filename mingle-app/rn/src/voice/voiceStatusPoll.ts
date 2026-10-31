// Lightweight poller for the room banner: calls GET /voice on an interval while
// the chat is open, so the banner can show "a voice room is live, N/8, Join".
// Pure/timer-injectable so it can be unit-tested without real timers.

import type { VoiceApi, VoiceCall } from './voiceApi';

export type VoiceStatusPollOptions = {
  api: VoiceApi;
  conversationId: string;
  intervalMs?: number; // default 10s
  onUpdate: (call: VoiceCall | null) => void;
  onError?: (error: unknown) => void;
  setInterval?: (cb: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
};

export type VoiceStatusPoll = {
  start: () => void;
  stop: () => void;
  /** Force an immediate fetch (e.g. right after join/leave). */
  refresh: () => Promise<void>;
};

const DEFAULT_INTERVAL_MS = 10_000;

export function createVoiceStatusPoll(options: VoiceStatusPollOptions): VoiceStatusPoll {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const setTimer = options.setInterval ?? ((cb: () => void, ms: number) => setInterval(cb, ms));
  const clearTimer = options.clearInterval ?? ((h: unknown) => clearInterval(h as ReturnType<typeof setInterval>));

  let handle: unknown = null;
  let inflight = false;
  let disposed = false;

  async function refresh(): Promise<void> {
    if (inflight || disposed) return;
    inflight = true;
    try {
      const { call } = await options.api.getStatus(options.conversationId);
      if (!disposed) options.onUpdate(call);
    } catch (error) {
      if (!disposed) options.onError?.(error);
    } finally {
      inflight = false;
    }
  }

  return {
    start() {
      if (handle !== null || disposed) return;
      void refresh();
      handle = setTimer(() => void refresh(), intervalMs);
    },
    stop() {
      disposed = true;
      if (handle !== null) {
        clearTimer(handle);
        handle = null;
      }
    },
    refresh,
  };
}
