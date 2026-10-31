// RN <-> WebView bridge contract for the voice room.
//
// The chat page lives in the WebView. It drives the native voice overlay with
// `mingle:native-voice` commands (web -> native, parsed here) and receives
// `mingle:native-voice` events (native -> web) so it can render the in-chat
// banner state and know when a room opened/closed.
//
// web -> native commands (sent via window.ReactNativeWebView.postMessage):
//   { type: 'native_voice_open', payload: { conversationId, title?, lang?, interpret? } }
//   { type: 'native_voice_close' }
//   { type: 'native_voice_status_request', payload: { conversationId } }
//
// native -> web events (dispatched on window as CustomEvent detail):
//   { type: 'state', phase: 'idle'|'connecting'|'connected'|'left'|'error', conversationId, errorKind? }
//   { type: 'status', conversationId, call }   // banner data from GET /voice

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

export type VoiceBridgeCommand = VoiceOpenCommand | VoiceCloseCommand | VoiceStatusRequestCommand;

export function isVoiceBridgeCommandType(type: unknown): boolean {
  return (
    type === 'native_voice_open' ||
    type === 'native_voice_close' ||
    type === 'native_voice_status_request'
  );
}

/** Narrows an already-parsed message object into a typed voice command. */
export function parseVoiceBridgeCommand(parsed: unknown): VoiceBridgeCommand | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const msg = parsed as Record<string, unknown>;
  const type = msg.type;

  if (type === 'native_voice_close') return { type: 'native_voice_close' };

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

export type VoiceBridgeEventDetail = VoiceStateEventDetail | VoiceStatusEventDetail;

/** Builds the injectable JS that dispatches a native -> web voice event. */
export function buildVoiceEventScript(detail: VoiceBridgeEventDetail): string {
  const serialized = JSON.stringify(detail);
  return `window.dispatchEvent(new CustomEvent(${JSON.stringify(NATIVE_VOICE_EVENT)}, { detail: ${serialized} })); true;`;
}
