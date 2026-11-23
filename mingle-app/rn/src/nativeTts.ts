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

type NativeTtsStreamOptions = {
  playbackId: string;
  utteranceId?: string;
  sampleRate: number;
  stopOnEarphoneDisconnect?: boolean;
};

type NativeTtsSpeakOptions = {
  text: string;
  language: string;
  playbackId: string;
  utteranceId?: string;
  stopOnEarphoneDisconnect?: boolean;
};

type NativeTtsModuleType = {
  play(options: NativeTtsPlayOptions): Promise<unknown>;
  // On-device speech with the system voice (shells that have it).
  speak?(options: NativeTtsSpeakOptions): Promise<unknown>;
  stop(): Promise<{ ok: boolean }>;
  // Streamed playback (headerless 16-bit mono PCM handed over in pieces).
  // Only shells that implement it have these methods.
  playStream?(options: NativeTtsStreamOptions): Promise<unknown>;
  appendStream?(playbackId: string, audioBase64: string): void;
  endStream?(playbackId: string): void;
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

/**
 * True when this shell plays TTS clips natively (`native_tts_play`). iOS has
 * always done so; Android does from the build that lowers other apps' volume
 * while a clip plays, and reports it as `nativeTts` in its capabilities.
 */
export function isNativeTtsAvailable(): boolean {
  return (Platform.OS === 'ios' || Platform.OS === 'android') && Boolean(nativeModule && nativeEmitter);
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

/**
 * True when this shell plays a clip that is still arriving
 * (`native_tts_stream_*`), reported to the page as `ttsStream`.
 */
export function isNativeTtsStreamAvailable(): boolean {
  return isNativeTtsAvailable()
    && typeof nativeModule?.playStream === 'function'
    && typeof nativeModule?.appendStream === 'function'
    && typeof nativeModule?.endStream === 'function';
}

/** Opens a streamed clip; resolves once the player is ready for audio (or refused it). */
export async function startNativeTtsStream(options: NativeTtsStreamOptions): Promise<NativeTtsPlayResult> {
  if (!nativeModule?.playStream) {
    throw new Error('NativeTTSModule streaming is unavailable on this runtime.');
  }
  return normalizeNativeTtsPlayResult(await nativeModule.playStream(options));
}

export function appendNativeTtsStream(playbackId: string, audioBase64: string): void {
  nativeModule?.appendStream?.(playbackId, audioBase64);
}

export function endNativeTtsStream(playbackId: string): void {
  nativeModule?.endStream?.(playbackId);
}

/**
 * True when this shell speaks text with the on-device system voice
 * (`native_tts_speak`), reported to the page as `ttsSpeak`: iOS
 * AVSpeechSynthesizer, Android TextToSpeech.
 */
export function isNativeTtsSpeakAvailable(): boolean {
  return isNativeTtsAvailable() && typeof nativeModule?.speak === 'function';
}

/** Resolves once the rendered sentence really started playing (or was refused). */
export async function speakNativeTts(options: NativeTtsSpeakOptions): Promise<NativeTtsPlayResult> {
  if (!nativeModule?.speak) {
    throw new Error('NativeTTSModule speech is unavailable on this runtime.');
  }
  return normalizeNativeTtsPlayResult(await nativeModule.speak(options));
}

export type NativeTtsSpeakCommandPayload = {
  utteranceId: string;
  playbackId?: string;
  text?: string;
  language?: string;
  stopOnEarphoneDisconnect?: boolean;
};

export type NativeTtsSpeakRequest = {
  utteranceId: string;
  playbackId: string;
  text: string;
  language: string;
  stopOnEarphoneDisconnect: boolean;
};

/** The web's `native_tts_speak` payload, as handed to NativeTTSModule.speak. */
export function resolveNativeTtsSpeakRequest(payload: NativeTtsSpeakCommandPayload): NativeTtsSpeakRequest {
  const playbackId = typeof payload.playbackId === 'string' && payload.playbackId.trim()
    ? payload.playbackId.trim()
    : payload.utteranceId;
  return {
    utteranceId: payload.utteranceId,
    playbackId,
    text: typeof payload.text === 'string' ? payload.text.trim() : '',
    language: typeof payload.language === 'string' ? payload.language.trim() : '',
    stopOnEarphoneDisconnect: payload.stopOnEarphoneDisconnect === true,
  };
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

export type NativeTtsStreamStartCommandPayload = {
  utteranceId: string;
  playbackId?: string;
  sampleRate?: number;
  stopOnEarphoneDisconnect?: boolean;
};

export type NativeTtsStreamStartRequest = {
  utteranceId: string;
  playbackId: string;
  sampleRate: number;
  stopOnEarphoneDisconnect: boolean;
};

const DEFAULT_TTS_STREAM_SAMPLE_RATE = 24000;

/** The web's `native_tts_stream_start` payload, as handed to NativeTTSModule.playStream. */
export function resolveNativeTtsStreamStartRequest(
  payload: NativeTtsStreamStartCommandPayload,
): NativeTtsStreamStartRequest {
  const playbackId = typeof payload.playbackId === 'string' && payload.playbackId.trim()
    ? payload.playbackId.trim()
    : payload.utteranceId;
  const sampleRate = typeof payload.sampleRate === 'number'
    && Number.isFinite(payload.sampleRate) && payload.sampleRate >= 8000 && payload.sampleRate <= 48000
    ? Math.round(payload.sampleRate)
    : DEFAULT_TTS_STREAM_SAMPLE_RATE;
  return {
    utteranceId: payload.utteranceId,
    playbackId,
    sampleRate,
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
