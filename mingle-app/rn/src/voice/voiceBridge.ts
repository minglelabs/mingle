// RN <-> WebView bridge contract for the voice room.
//
// The chat page lives in the WebView. It drives the native voice overlay with
// `mingle:native-voice` commands (web -> native, parsed here) and receives
// `mingle:native-voice` events (native -> web) so it can render the in-chat
// banner state and know when a room opened/closed.
//
// The voice UI is drawn by the web chat page (a panel under its top bar).
// Native only runs the call: LiveKit, mic, audio route, volumes.
//
// web -> native commands (sent via window.ReactNativeWebView.postMessage):
//   { type: 'native_voice_open', payload: { conversationId, title?, lang?, interpret? } }  // join
//   { type: 'native_voice_close' }                                                        // leave
//   { type: 'native_voice_status_request', payload: { conversationId } }                 // poll GET /voice
//   { type: 'native_voice_status_stop' }                                                  // stop polling
//   { type: 'native_voice_set', payload: { mic?, interpret?, mode?, origVol? } }
//
// native -> web events (dispatched on window as CustomEvent detail):
//   { type: 'state', phase: 'idle'|'connecting'|'connected'|'left'|'error', conversationId, errorKind? }
//   { type: 'status', conversationId, call }       // who is in the call, from GET /voice
//   { type: 'room', conversationId, snapshot }     // live call state while joined

export const NATIVE_VOICE_EVENT = 'mingle:native-voice';

export type VoiceOpenCommand = {
  type: 'native_voice_open';
  payload: {
    conversationId: string;
    title?: string;
    lang?: string;
    interpret?: boolean;
  };
};

export type VoiceCloseCommand = { type: 'native_voice_close' };

export type VoiceStatusRequestCommand = {
  type: 'native_voice_status_request';
  payload: { conversationId: string };
};

// The web panel's buttons: mic, interpretation, volume mode and mix.
export type VoiceSetCommand = {
  type: 'native_voice_set';
  payload: {
    mic?: boolean;
    interpret?: boolean;
    mode?: 'static' | 'dynamic';
    origVol?: number;
  };
};

// The chat screen closed: stop polling who is in its call.
export type VoiceStatusStopCommand = { type: 'native_voice_status_stop' };

export type VoiceBridgeCommand =
  | VoiceOpenCommand
  | VoiceCloseCommand
  | VoiceStatusRequestCommand
  | VoiceStatusStopCommand
  | VoiceSetCommand;

export function isVoiceBridgeCommandType(type: unknown): boolean {
  return (
    type === 'native_voice_open' ||
    type === 'native_voice_close' ||
    type === 'native_voice_status_request' ||
    type === 'native_voice_status_stop' ||
    type === 'native_voice_set'
  );
}

/** Narrows an already-parsed message object into a typed voice command. */
export function parseVoiceBridgeCommand(parsed: unknown): VoiceBridgeCommand | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const msg = parsed as Record<string, unknown>;
  const type = msg.type;

  if (type === 'native_voice_close') return { type: 'native_voice_close' };
  if (type === 'native_voice_status_stop') return { type: 'native_voice_status_stop' };

  if (type === 'native_voice_open') {
    const payload = (msg.payload && typeof msg.payload === 'object') ? (msg.payload as Record<string, unknown>) : {};
    const conversationId = typeof payload.conversationId === 'string' ? payload.conversationId.trim() : '';
    if (!conversationId) return null;
    return {
      type: 'native_voice_open',
      payload: {
        conversationId,
        title: typeof payload.title === 'string' ? payload.title : undefined,
        lang: typeof payload.lang === 'string' ? payload.lang : undefined,
        interpret: typeof payload.interpret === 'boolean' ? payload.interpret : undefined,
      },
    };
  }

  if (type === 'native_voice_set') {
    const payload = (msg.payload && typeof msg.payload === 'object') ? (msg.payload as Record<string, unknown>) : {};
    const out: VoiceSetCommand['payload'] = {};
    if (typeof payload.mic === 'boolean') out.mic = payload.mic;
    if (typeof payload.interpret === 'boolean') out.interpret = payload.interpret;
    if (payload.mode === 'static' || payload.mode === 'dynamic') out.mode = payload.mode;
    if (typeof payload.origVol === 'number' && Number.isFinite(payload.origVol)) {
      out.origVol = Math.max(0, Math.min(1, payload.origVol));
    }
    if (Object.keys(out).length === 0) return null;
    return { type: 'native_voice_set', payload: out };
  }

  if (type === 'native_voice_status_request') {
    const payload = (msg.payload && typeof msg.payload === 'object') ? (msg.payload as Record<string, unknown>) : {};
    const conversationId = typeof payload.conversationId === 'string' ? payload.conversationId.trim() : '';
    if (!conversationId) return null;
    return { type: 'native_voice_status_request', payload: { conversationId } };
  }

  return null;
}

export type VoicePhase = 'idle' | 'connecting' | 'connected' | 'left' | 'error';

export type VoiceStateEventDetail = {
  type: 'state';
  phase: VoicePhase;
  conversationId: string | null;
  errorKind?: string;
};

export type VoiceStatusEventDetail = {
  type: 'status';
  conversationId: string;
  // Shape matches VoiceCall | null; kept loose to avoid a UI import cycle.
  call: unknown;
};

// Everything the web panel draws while this phone is in the call: who is in,
// who is speaking, the buttons' state and the newest caption lines.
export type VoiceRoomEventDetail = {
  type: 'room';
  conversationId: string;
  // Shape matches VoiceSnapshot; kept loose to avoid a UI import cycle.
  snapshot: unknown;
};

export type VoiceBridgeEventDetail = VoiceStateEventDetail | VoiceStatusEventDetail | VoiceRoomEventDetail;

/** Builds the injectable JS that dispatches a native -> web voice event. */
export function buildVoiceEventScript(detail: VoiceBridgeEventDetail): string {
  const serialized = JSON.stringify(detail);
  return `window.dispatchEvent(new CustomEvent(${JSON.stringify(NATIVE_VOICE_EVENT)}, { detail: ${serialized} })); true;`;
}
