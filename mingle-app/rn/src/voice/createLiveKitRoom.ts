import { Platform } from 'react-native';

import type { LkRoom } from '../nativeVoice';
import { registerVoiceGlobals } from './registerVoiceGlobals';

// Factory that builds a real LiveKit Room. `Room` comes from `livekit-client`;
// `@livekit/react-native` only supplies the native WebRTC globals and the audio
// session, so the globals must be registered before `livekit-client` loads.
// Isolated here so the controller and all pure logic stay importable without
// the native module (tests inject their own factory). The requires are lazy.
export function createLiveKitRoom(opts: Record<string, unknown>): LkRoom {
  registerVoiceGlobals();
  if (Platform.OS === 'android') {
    // iOS configures its audio session from registerGlobals(); Android needs
    // the communication audio session started explicitly.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require('@livekit/react-native') as { AudioSession?: { startAudioSession?: () => Promise<void> } };
    void rn.AudioSession?.startAudioSession?.().catch(() => undefined);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const livekit = require('livekit-client') as {
    Room: new (opts: Record<string, unknown>) => unknown;
  };
  return new livekit.Room(opts) as LkRoom;
}
