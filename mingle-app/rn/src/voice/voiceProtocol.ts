// Pure, framework-free logic for the group voice room.
//
// Everything here is unit-testable without React Native or LiveKit: the
// interpreter data-channel caption protocol parser, the per-language track
// subscription decision, and the original/interpreted volume mix. The POC
// (`mingle-voice-agent/public/index.html`) is the behavioural reference.

/** LiveKit data-channel topic the hidden interpreter publishes captions on. */
export const INTERPRETER_TOPIC = 'interpreter';

/** Translated audio track name prefix, one track per target language: `tr:ja`. */
export const LANE_PREFIX = 'tr:';

/** A hidden interpreter participant's identity always starts with this. */
export const INTERPRETER_IDENTITY_PREFIX = 'interpreter-';

/** Fixed original-audio ducking levels (fractions of full volume). */
export const DUCK_ORIG_STATIC = 0.25; // interpret ON, static mode: original always quiet
export const DUCK_ORIG_DYNAMIC_LOW = 0.15; // interpret ON, dynamic mode, while a lane is playing
export const VOLUME_FULL = 1;

export type InterpretVolumeMode = 'static' | 'dynamic';

// ---------------------------------------------------------------------------
// Participant model (a thin, LiveKit-agnostic view of a room participant)
// ---------------------------------------------------------------------------

export type ParticipantAttributes = {
  lang?: string;
  interpret?: 'on' | 'off' | string;
  role?: 'interpreter' | string;
};

export type VoiceParticipantView = {
  identity: string;
  attributes?: ParticipantAttributes;
};

/** Hidden interpreter: never shown in the human speaker grid. */
export function isInterpreterParticipant(p: VoiceParticipantView | null | undefined): boolean {
  if (!p) return false;
  if (p.attributes?.role === 'interpreter') return true;
  return typeof p.identity === 'string' && p.identity.startsWith(INTERPRETER_IDENTITY_PREFIX);
}

export function participantLang(p: VoiceParticipantView | null | undefined): string {
  return (p && p.attributes && typeof p.attributes.lang === 'string' && p.attributes.lang) || '';
}

export function participantInterpretOff(p: VoiceParticipantView | null | undefined): boolean {
  return Boolean(p && p.attributes && p.attributes.interpret === 'off');
}

// ---------------------------------------------------------------------------
// Subscription decision (POC: wantSubscribed)
// ---------------------------------------------------------------------------

export type TrackPublicationView = {
  kind: 'audio' | 'video' | string;
  trackName?: string;
};

export type SubscriptionState = {
  interpretOn: boolean;
  /** The local user's chosen listening language (e.g. 'ja'). */
  myLang: string;
};

/**
 * Decides whether the local user should be subscribed to a given publication.
 * - Non-audio tracks: never.
 * - Interpreter tracks: only the `tr:<myLang>` lane, and only while interpret is ON.
 * - Human tracks: always (we always hear the humans; the mix duck handles balance).
 */
export function shouldSubscribe(
  pub: TrackPublicationView,
  participant: VoiceParticipantView,
  state: SubscriptionState,
): boolean {
  if (pub.kind !== 'audio') return false;
  if (isInterpreterParticipant(participant)) {
    return state.interpretOn && pub.trackName === LANE_PREFIX + state.myLang;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Volume mix (POC: originalVolume + applyVolumes)
// ---------------------------------------------------------------------------

export type VolumeState = {
  interpretOn: boolean;
  myLang: string;
  mode: InterpretVolumeMode;
  /** Static-mode original-audio volume fraction (slider), default 0.25. */
  origVol: number;
  /** Interpreted-track volume fraction (slider), default 1.0. */
  trVol: number;
  /** Dynamic mode: true while the interpreter lane for my language is playing. */
  lanePlaying: boolean;
  /** Dynamic-mode ducked level, default 0.15. */
  duckLow?: number;
};

/** Volume for a HUMAN speaker's original-audio track. */
export function originalVolume(participant: VoiceParticipantView, state: VolumeState): number {
  // Interpret OFF, or this speaker already speaks my language: full original.
  if (!state.interpretOn || participantLang(participant) === state.myLang) return VOLUME_FULL;
  if (state.mode === 'dynamic') {
    return state.lanePlaying ? (state.duckLow ?? DUCK_ORIG_DYNAMIC_LOW) : VOLUME_FULL;
  }
  return state.origVol;
}

/** Volume for any audio track, dispatching interpreter vs. human. */
export function volumeForTrack(participant: VoiceParticipantView, state: VolumeState): number {
  return isInterpreterParticipant(participant) ? state.trVol : originalVolume(participant, state);
}

export function clampVolumeFraction(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  if (raw < 0) return 0;
  if (raw > 1) return 1;
  return raw;
}

// ---------------------------------------------------------------------------
// Caption protocol parser (POC: onCaption data-channel JSON)
// ---------------------------------------------------------------------------

export type CaptionMessage =
  | { type: 'partial'; id: string; speaker?: string; speakerName?: string; lang?: string; text: string }
  | {
      type: 'final' | 'echo';
      id: string;
      partialId?: string;
      speaker?: string;
      speakerName?: string;
      lang?: string;
      text: string;
    }
  | { type: 'translation'; id: string; lang: string; text: string }
  | { type: 'play'; id: string; lang: string; metrics?: CaptionPlayMetrics }
  | { type: 'lane'; lang: string; playing: boolean }
  | { type: 'error'; id?: string; lang?: string; message: string };

export type CaptionPlayMetrics = {
  speechEndToPlayMs?: number;
  endpointMs?: number;
  translateMs?: number;
  translator?: string;
  ttsFirstAudioMs?: number;
  queueMs?: number;
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Parses one interpreter data-channel JSON message into a typed CaptionMessage.
 * Returns null for anything malformed or an unknown `type` so a bad frame can
 * never crash the captions view.
 */
export function parseCaptionMessage(raw: unknown): CaptionMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const msg = raw as Record<string, unknown>;
  const type = asString(msg.type);
  if (!type) return null;

  switch (type) {
    case 'partial': {
      const id = asString(msg.id);
      const text = asString(msg.text);
      if (!id || text === undefined) return null;
      return {
        type: 'partial',
        id,
        text,
        speaker: asString(msg.speaker),
        speakerName: asString(msg.speakerName),
        lang: asString(msg.lang),
      };
    }
    case 'final':
    case 'echo': {
      const id = asString(msg.id);
      const text = asString(msg.text);
      if (!id || text === undefined) return null;
      return {
        type,
        id,
        text,
        partialId: asString(msg.partialId),
        speaker: asString(msg.speaker),
        speakerName: asString(msg.speakerName),
        lang: asString(msg.lang),
      };
    }
    case 'translation': {
      const id = asString(msg.id);
      const lang = asString(msg.lang);
      const text = asString(msg.text);
      if (!id || !lang || text === undefined) return null;
      return { type: 'translation', id, lang, text };
    }
    case 'play': {
      const id = asString(msg.id);
      const lang = asString(msg.lang);
      if (!id || !lang) return null;
      const metrics = (msg.metrics && typeof msg.metrics === 'object')
        ? (msg.metrics as CaptionPlayMetrics)
        : undefined;
      return { type: 'play', id, lang, metrics };
    }
    case 'lane': {
      const lang = asString(msg.lang);
      if (!lang || typeof msg.playing !== 'boolean') return null;
      return { type: 'lane', lang, playing: msg.playing };
    }
    case 'error': {
      const message = asString(msg.message);
      if (message === undefined) return null;
      return { type: 'error', id: asString(msg.id), lang: asString(msg.lang), message };
    }
    default:
      return null;
  }
}

/** Decode a LiveKit DataReceived payload (Uint8Array) into a CaptionMessage. */
export function decodeCaptionPayload(
  payload: Uint8Array,
  decode: (bytes: Uint8Array) => string = defaultDecode,
): CaptionMessage | null {
  try {
    return parseCaptionMessage(JSON.parse(decode(payload)));
  } catch {
    return null;
  }
}

function defaultDecode(bytes: Uint8Array): string {
  // TextDecoder exists in RN's Hermes runtime; fall back to a manual UTF-8
  // decode only if it is somehow missing (keeps this file test-portable).
  const DecoderCtor = (globalThis as { TextDecoder?: typeof TextDecoder }).TextDecoder;
  if (DecoderCtor) return new DecoderCtor().decode(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

// ---------------------------------------------------------------------------
// Caption line store (POC: state.lines / state.partialToId remapping)
// ---------------------------------------------------------------------------

export type CaptionLine = {
  id: string;
  speakerName: string;
  lang: string;
  /** Original transcript (partial while streaming, final once settled). */
  original: string;
  /** True while this is still a live partial. */
  isPartial: boolean;
  /** This line was flagged as an echo (self translated back). */
  isEcho: boolean;
  /** Per-language translations keyed by language code. */
  translations: Record<string, string>;
  /** Latest end-to-end latency metrics for the local user's language, if any. */
  metrics?: CaptionPlayMetrics;
};

export type CaptionStoreState = {
  /** Insertion-ordered lines (newest first is a view concern; store keeps a map). */
  lines: Map<string, CaptionLine>;
  /** Maps a resolved partialId -> final id so late translations still land. */
  partialToId: Map<string, string>;
};

export function createCaptionStore(): CaptionStoreState {
  return { lines: new Map(), partialToId: new Map() };
}

function ensureLine(store: CaptionStoreState, id: string): CaptionLine {
  let line = store.lines.get(id);
  if (!line) {
    line = {
      id,
      speakerName: '',
      lang: '',
      original: '',
      isPartial: false,
      isEcho: false,
      translations: {},
    };
    store.lines.set(id, line);
  }
  return line;
}

/**
 * Applies one caption message to the store (mutating it) and returns the line
 * id affected, or null when nothing changed. `myLang` decides which play
 * metrics are attached (only the local user's language).
 */
export function applyCaption(
  store: CaptionStoreState,
  msg: CaptionMessage,
  myLang: string,
): string | null {
  switch (msg.type) {
    case 'partial': {
      const line = ensureLine(store, msg.id);
      line.original = msg.text;
      line.isPartial = true;
      if (msg.speakerName) line.speakerName = msg.speakerName;
      if (msg.lang) line.lang = msg.lang;
      return msg.id;
    }
    case 'final':
    case 'echo': {
      // Carry the partial's accumulated state over to the final id.
      if (msg.partialId && store.lines.has(msg.partialId) && msg.partialId !== msg.id) {
        const partial = store.lines.get(msg.partialId)!;
        store.lines.delete(msg.partialId);
        store.lines.set(msg.id, partial);
        partial.id = msg.id;
        store.partialToId.set(msg.partialId, msg.id);
      }
      const line = ensureLine(store, msg.id);
      line.original = msg.text;
      line.isPartial = false;
      if (msg.speakerName) line.speakerName = msg.speakerName;
      if (msg.lang) line.lang = msg.lang;
      if (msg.type === 'echo') line.isEcho = true;
      return msg.id;
    }
    case 'translation': {
      const targetId = store.lines.has(msg.id) ? msg.id : store.partialToId.get(msg.id);
      if (!targetId) return null;
      const line = store.lines.get(targetId);
      if (!line) return null;
      line.translations[msg.lang] = msg.text;
      return targetId;
    }
    case 'play': {
      if (msg.lang !== myLang) return null;
      const targetId = store.lines.has(msg.id) ? msg.id : store.partialToId.get(msg.id);
      if (!targetId) return null;
      const line = store.lines.get(targetId);
      if (!line) return null;
      line.metrics = msg.metrics;
      return targetId;
    }
    case 'error': {
      if (!msg.id) return null;
      const targetId = store.lines.has(msg.id) ? msg.id : store.partialToId.get(msg.id);
      if (!targetId) return null;
      return targetId;
    }
    case 'lane':
    default:
      return null;
  }
}

/** Returns lines newest-first for rendering (caps to `limit`). */
export function captionLinesNewestFirst(store: CaptionStoreState, limit = 50): CaptionLine[] {
  const all = Array.from(store.lines.values());
  const tail = all.slice(Math.max(0, all.length - limit));
  return tail.reverse();
}
