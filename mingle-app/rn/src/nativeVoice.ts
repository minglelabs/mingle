// Voice room connection + state controller.
//
// Owns the LiveKit Room lifecycle and projects it into a plain, observable
// snapshot the React screens render. All non-LiveKit logic (subscription
// decisions, volume mix, caption parsing) lives in ./voice/voiceProtocol so it
// stays unit-testable; this module is the glue that drives a real Room with it.
//
// Connection flow mirrors the POC:
//   token = api.requestToken(convId, { lang, interpret })
//   room.connect(url, token, { autoSubscribe: false })
//   setMicrophoneEnabled(true)  (listener-only fallback if denied)
//   on TrackPublished/ParticipantConnected -> syncSubscriptions()
//   on TrackSubscribed -> applyVolumes()
//   on DataReceived(topic=interpreter) -> parse caption, update store
//   on ActiveSpeakersChanged -> update speaking set
//   interpret toggle -> setAttributes({interpret}) + re-sync + re-mix

import {
  INTERPRETER_TOPIC,
  LANE_PREFIX,
  DUCK_ORIG_STATIC,
  type CaptionLine,
  type InterpretVolumeMode,
  type SubscriptionState,
  type VoiceParticipantView,
  type VolumeState,
  applyCaption,
  captionLinesNewestFirst,
  clampVolumeFraction,
  createCaptionStore,
  decodeCaptionPayload,
  isInterpreterParticipant,
  participantInterpretOff,
  participantLang,
  shouldSubscribe,
  volumeForTrack,
} from './voice/voiceProtocol';
import type { VoiceApi, VoiceCall, VoiceParticipant } from './voice/voiceApi';

// --- Minimal structural LiveKit types (so tests can supply a fake room) -----

export type LkTrack = {
  kind: string;
  setVolume?: (v: number) => void;
};

export type LkPublication = {
  kind: string;
  trackName?: string;
  isSubscribed?: boolean;
  track?: LkTrack | null;
  setSubscribed?: (want: boolean) => void;
};

export type LkParticipant = {
  identity: string;
  name?: string;
  attributes?: Record<string, string>;
  trackPublications: Map<string, LkPublication>;
  setMicrophoneEnabled?: (enabled: boolean) => Promise<void>;
  setAttributes?: (attrs: Record<string, string>) => Promise<void>;
};

export type LkRoom = {
  name?: string;
  localParticipant: LkParticipant;
  remoteParticipants: Map<string, LkParticipant>;
  activeSpeakers: LkParticipant[];
  on: (event: string, cb: (...args: unknown[]) => void) => LkRoom;
  connect: (url: string, token: string, opts?: Record<string, unknown>) => Promise<void>;
  disconnect: () => Promise<void>;
  startAudio?: () => Promise<void>;
};

// LiveKit RoomEvent string names we subscribe to.
export const ROOM_EVENTS = {
  TrackPublished: 'trackPublished',
  ParticipantConnected: 'participantConnected',
  ParticipantDisconnected: 'participantDisconnected',
  ParticipantAttributesChanged: 'participantAttributesChanged',
  ActiveSpeakersChanged: 'activeSpeakersChanged',
  TrackSubscribed: 'trackSubscribed',
  TrackUnsubscribed: 'trackUnsubscribed',
  DataReceived: 'dataReceived',
  Disconnected: 'disconnected',
} as const;

// --- Public snapshot the UI renders ----------------------------------------

export type VoiceConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'
  | 'disconnected';

export type VoiceGridMember = {
  identity: string;
  userId: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  lang: string;
  interpretOff: boolean;
};

export type VoiceSnapshot = {
  status: VoiceConnectionStatus;
  /** The language this device joined with (token `lang`, my `tr:<lang>` lane). */
  myLang: string;
  errorKind?: string;
  conversationId: string | null;
  roomName: string | null;
  members: VoiceGridMember[]; // interpreter excluded
  participantCount: number;
  maxParticipants: number;
  micOn: boolean;
  micAvailable: boolean;
  interpretOn: boolean;
  mode: InterpretVolumeMode;
  origVol: number;
  trVol: number;
  captions: CaptionLine[];
};

export type VoiceControllerDeps = {
  api: VoiceApi;
  /** Factory for a connected-but-not-yet-connected LiveKit Room. */
  createRoom: (opts: Record<string, unknown>) => LkRoom;
  /** My listening/speaking language. */
  myLang: string;
  /** Local user id, used to match the local grid tile to its API participant. */
  localUserId: string;
  maxCaptions?: number;
};

const DEFAULT_MAX = 8;

export function createVoiceController(deps: VoiceControllerDeps) {
  const captionStore = createCaptionStore();
  let room: LkRoom | null = null;
  const listeners = new Set<() => void>();

  const state = {
    status: 'idle' as VoiceConnectionStatus,
    errorKind: undefined as string | undefined,
    conversationId: null as string | null,
    roomName: null as string | null,
    micOn: true,
    micAvailable: true,
    interpretOn: true,
    mode: 'static' as InterpretVolumeMode,
    origVol: DUCK_ORIG_STATIC,
    trVol: 1,
    lanePlaying: false,
    maxParticipants: DEFAULT_MAX,
    apiParticipants: [] as VoiceParticipant[],
    speakingIdentities: new Set<string>(),
  };

  function emit() {
    for (const l of listeners) l();
  }

  function subscriptionState(): SubscriptionState {
    return { interpretOn: state.interpretOn, myLang: deps.myLang };
  }

  function volumeState(): VolumeState {
    return {
      interpretOn: state.interpretOn,
      myLang: deps.myLang,
      mode: state.mode,
      origVol: state.origVol,
      trVol: state.trVol,
      lanePlaying: state.lanePlaying,
    };
  }

  function toView(p: LkParticipant): VoiceParticipantView {
    return { identity: p.identity, attributes: p.attributes };
  }

  function syncSubscriptions() {
    if (!room) return;
    const sub = subscriptionState();
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        const want = shouldSubscribe(pub, toView(p), sub);
        if (pub.isSubscribed !== want) pub.setSubscribed?.(want);
      }
    }
  }

  function applyVolumes() {
    if (!room) return;
    const vol = volumeState();
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        if (pub.kind !== 'audio' || !pub.track) continue;
        pub.track.setVolume?.(volumeForTrack(toView(p), vol));
      }
    }
  }

  function updateSpeaking() {
    if (!room) return;
    state.speakingIdentities = new Set(room.activeSpeakers.map((p) => p.identity));
    emit();
  }

  function handleData(payload: Uint8Array, _p: unknown, _kind: unknown, topic?: string) {
    if (topic !== INTERPRETER_TOPIC) return;
    const msg = decodeCaptionPayload(payload);
    if (!msg) return;
    if (msg.type === 'lane') {
      if (msg.lang === deps.myLang) {
        state.lanePlaying = msg.playing;
        applyVolumes();
      }
      return;
    }
    applyCaption(captionStore, msg, deps.myLang);
    emit();
  }

  function wireEvents(r: LkRoom) {
    r.on(ROOM_EVENTS.TrackPublished, () => syncSubscriptions())
      .on(ROOM_EVENTS.ParticipantConnected, () => {
        syncSubscriptions();
        emit();
      })
      .on(ROOM_EVENTS.ParticipantDisconnected, () => emit())
      .on(ROOM_EVENTS.ParticipantAttributesChanged, () => {
        applyVolumes();
        emit();
      })
      .on(ROOM_EVENTS.ActiveSpeakersChanged, () => updateSpeaking())
      .on(ROOM_EVENTS.TrackSubscribed, (track: unknown) => {
        if ((track as LkTrack)?.kind === 'audio') applyVolumes();
      })
      .on(ROOM_EVENTS.TrackUnsubscribed, () => {})
      .on(ROOM_EVENTS.DataReceived, (payload: unknown, p: unknown, kind: unknown, topic: unknown) =>
        handleData(payload as Uint8Array, p, kind, topic as string | undefined),
      )
      .on(ROOM_EVENTS.Disconnected, () => {
        state.status = 'disconnected';
        emit();
      });
  }

  async function connect(conversationId: string): Promise<void> {
    if (state.status === 'connecting' || state.status === 'connected') return;
    state.status = 'connecting';
    state.errorKind = undefined;
    state.conversationId = conversationId;
    emit();
    try {
      const tokenRes = await deps.api.requestToken(conversationId, {
        lang: deps.myLang,
        interpret: state.interpretOn,
      });
      state.roomName = tokenRes.room;
      applyCall(tokenRes.call);

      const r = deps.createRoom({
        adaptiveStream: false,
        dynacast: false,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      room = r;
      wireEvents(r);
      await r.connect(tokenRes.url, tokenRes.token, { autoSubscribe: false });

      try {
        await r.localParticipant.setMicrophoneEnabled?.(true);
        state.micOn = true;
        state.micAvailable = true;
      } catch {
        state.micOn = false;
        state.micAvailable = false;
      }
      await r.startAudio?.().catch(() => undefined);

      state.status = 'connected';
      syncSubscriptions();
      applyVolumes();
      updateSpeaking();
      emit();
    } catch (error) {
      state.status = 'error';
      state.errorKind = (error as { kind?: string })?.kind ?? 'error';
      room = null;
      emit();
      throw error;
    }
  }

  function applyCall(call: VoiceCall | null | undefined) {
    if (!call) return;
    state.apiParticipants = call.participants ?? [];
    state.maxParticipants = call.maxParticipants || DEFAULT_MAX;
  }

  async function setInterpret(on: boolean): Promise<void> {
    state.interpretOn = on;
    state.lanePlaying = false;
    syncSubscriptions();
    applyVolumes();
    emit();
    await room?.localParticipant.setAttributes?.({ interpret: on ? 'on' : 'off' }).catch(() => undefined);
  }

  async function setMicOn(on: boolean): Promise<void> {
    if (!state.micAvailable) return;
    state.micOn = on;
    emit();
    await room?.localParticipant.setMicrophoneEnabled?.(on).catch(() => undefined);
  }

  function setMode(mode: InterpretVolumeMode): void {
    state.mode = mode;
    applyVolumes();
    emit();
  }

  function setOrigVol(fraction: number): void {
    state.origVol = clampVolumeFraction(fraction);
    applyVolumes();
    emit();
  }

  function setTrVol(fraction: number): void {
    state.trVol = clampVolumeFraction(fraction);
    applyVolumes();
    emit();
  }

  async function leave(): Promise<void> {
    const convId = state.conversationId;
    try {
      await room?.disconnect();
    } catch {
      /* ignore */
    }
    room = null;
    if (convId) {
      await deps.api.leave(convId).catch(() => undefined);
    }
    state.status = 'disconnected';
    emit();
  }

  function buildMembers(): VoiceGridMember[] {
    const members: VoiceGridMember[] = [];
    const apiById = new Map(state.apiParticipants.map((p) => [p.userId, p]));
    const pushMember = (p: LkParticipant, isLocal: boolean) => {
      if (isInterpreterParticipant(toView(p))) return;
      const api = apiById.get(p.identity);
      members.push({
        identity: p.identity,
        userId: p.identity,
        // The server's name first: canUpdateOwnMetadata lets a client rename itself in LiveKit.
        name: api?.name || p.name || p.identity,
        isLocal,
        isSpeaking: state.speakingIdentities.has(p.identity),
        lang: participantLang(toView(p)) || api?.speechLanguage || '',
        interpretOff: participantInterpretOff(toView(p)),
      });
    };
    if (room) {
      pushMember(room.localParticipant, true);
      for (const p of room.remoteParticipants.values()) pushMember(p, false);
    } else {
      // Pre-join: show API participants so the banner/grid can preview.
      for (const api of state.apiParticipants) {
        members.push({
          identity: api.userId,
          userId: api.userId,
          name: api.name,
          isLocal: api.userId === deps.localUserId,
          isSpeaking: false,
          lang: api.speechLanguage || '',
          interpretOff: !api.interpretOn,
        });
      }
    }
    return members;
  }

  function getSnapshot(): VoiceSnapshot {
    const members = buildMembers();
    return {
      status: state.status,
      myLang: deps.myLang,
      errorKind: state.errorKind,
      conversationId: state.conversationId,
      roomName: state.roomName,
      members,
      participantCount: members.length,
      maxParticipants: state.maxParticipants,
      micOn: state.micOn,
      micAvailable: state.micAvailable,
      interpretOn: state.interpretOn,
      mode: state.mode,
      origVol: state.origVol,
      trVol: state.trVol,
      captions: captionLinesNewestFirst(captionStore, deps.maxCaptions ?? 50),
    };
  }

  return {
    connect,
    leave,
    setInterpret,
    setMicOn,
    setMode,
    setOrigVol,
    setTrVol,
    getSnapshot,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // Exposed for white-box tests of the LiveKit wiring.
    _internal: { syncSubscriptions, applyVolumes, handleData, updateSpeaking, wireEvents, getRoom: () => room },
  };
}

export type VoiceController = ReturnType<typeof createVoiceController>;

export const LANE_TRACK_PREFIX = LANE_PREFIX;
