import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

/** `reason` of a `tts_stopped` caused by the earphone guard (earphone mode contract A.5). */
export const NATIVE_TTS_EARPHONES_DISCONNECTED_REASON = 'earphones_disconnected';

type NativeTtsPlayOptions = {
  audioBase64: string;
  playbackId: string;
  utteranceId?: string;
  /**
   * iOS: stop this clip as soon as a route change leaves no earphone output
   * (contract A.5). Native builds without the guard ignore the key.
   */
  stopOnEarphoneDisconnect?: boolean;
};

export type NativeTtsPlayResult = {
  ok: boolean;
  reason?: string;
};

type NativeTtsModuleType = {
  play(options: NativeTtsPlayOptions): Promise<unknown>;
  stop(): Promise<{ ok: boolean }>;
};

type NativeTtsEventMap = {
  ttsPlaybackFinished: {
    success: boolean;
    playbackId?: string;
    utteranceId?: string;
  };
  ttsPlaybackStopped: {
    playbackId?: string;
    utteranceId?: string;
    reason?: string;
  };
  ttsError: {
    message: string;
    playbackId?: string;
    utteranceId?: string;
  };
};

const nativeModule = NativeModules.NativeTTSModule as NativeTtsModuleType | undefined;
const nativeEmitter = nativeModule ? new NativeEventEmitter(NativeModules.NativeTTSModule) : null;

export function isNativeTtsAvailable(): boolean {
  return Platform.OS === 'ios' && Boolean(nativeModule && nativeEmitter);
}

/**
 * Only an explicit `{ ok: false }` means the clip did not start (the iOS
 * earphone guard refused it). Anything else is today's `{ ok: true }`.
 */
export function normalizeNativeTtsPlayResult(raw: unknown): NativeTtsPlayResult {
  if (raw && typeof raw === 'object' && (raw as { ok?: unknown }).ok === false) {
    const reason = (raw as { reason?: unknown }).reason;
    return typeof reason === 'string' && reason.trim()
      ? { ok: false, reason: reason.trim() }
      : { ok: false };
  }
  return { ok: true };
}

/** Resolves once the native player really started (or refused) the clip. */
export async function playNativeTts(options: NativeTtsPlayOptions): Promise<NativeTtsPlayResult> {
  if (!nativeModule) {
    throw new Error('NativeTTSModule is unavailable on this runtime.');
  }
  return normalizeNativeTtsPlayResult(await nativeModule.play(options));
}

export async function stopNativeTts(): Promise<void> {
  if (!nativeModule) {
    return;
  }
  await nativeModule.stop();
}

export function addNativeTtsListener<T extends keyof NativeTtsEventMap>(
  eventName: T,
  listener: (event: NativeTtsEventMap[T]) => void,
): { remove: () => void } {
  if (!nativeEmitter) {
    return {
      remove: () => {
        // no-op on unsupported runtimes
      },
    };
  }

  const subscription = nativeEmitter.addListener(eventName, listener as (event: unknown) => void);
  return {
    remove: () => subscription.remove(),
  };
}

export type NativeTtsPlayCommandPayload = {
  utteranceId: string;
  playbackId?: string;
  audioBase64: string;
  contentType?: string;
  stopOnEarphoneDisconnect?: boolean;
};

export type NativeTtsPlayRequest = {
  utteranceId: string;
  playbackId: string;
  audioBase64: string;
  stopOnEarphoneDisconnect: boolean;
};

/** The web's `native_tts_play` payload, as handed to NativeTTSModule.play. */
export function resolveNativeTtsPlayRequest(payload: NativeTtsPlayCommandPayload): NativeTtsPlayRequest {
  const playbackId = typeof payload.playbackId === 'string' && payload.playbackId.trim()
    ? payload.playbackId.trim()
    : payload.utteranceId;
  return {
    utteranceId: payload.utteranceId,
    playbackId,
    audioBase64: payload.audioBase64,
    stopOnEarphoneDisconnect: payload.stopOnEarphoneDisconnect === true,
  };
}

export type NativeTtsPlaybackIdentity = {
  utteranceId: string;
  playbackId: string;
};

export type NativeTtsStartedEvent = {
  type: 'tts_started';
  playbackId: string;
  utteranceId: string;
};

/**
 * `tts_started` for a resolved NativeTTSModule.play (contract A.3), or null when
 * the clip did not start or was already superseded/stopped by a newer command
 * (a late "started" for it would re-animate a bubble that is no longer playing).
 */
export function resolveNativeTtsStartedEvent(
  result: NativeTtsPlayResult,
  request: NativeTtsPlaybackIdentity,
  currentPlayback: NativeTtsPlaybackIdentity | null,
): NativeTtsStartedEvent | null {
  if (!result.ok) return null;
  if (!currentPlayback || currentPlayback.playbackId !== request.playbackId) return null;
  return {
    type: 'tts_started',
    playbackId: request.playbackId || '',
    utteranceId: request.utteranceId || '',
  };
}

export type NativeTtsStoppedEvent = {
  type: 'tts_stopped';
  utteranceId: string;
  playbackId: string;
  reason?: string;
};

/** `tts_stopped`, carrying the native stop reason (e.g. `earphones_disconnected`) when there is one. */
export function buildNativeTtsStoppedEvent(
  identity: NativeTtsPlaybackIdentity,
  reason?: unknown,
): NativeTtsStoppedEvent {
  const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
  return {
    type: 'tts_stopped',
    utteranceId: identity.utteranceId || '',
    playbackId: identity.playbackId || '',
    ...(normalizedReason ? { reason: normalizedReason } : {}),
  };
}
