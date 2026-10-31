import type { LkRoom } from '../nativeVoice';
import { registerVoiceGlobals } from './registerVoiceGlobals';

// Factory that builds a real LiveKit Room, mapping the RoomEvent enum to the
// string names createVoiceController expects. Isolated here so the controller
// and all pure logic stay importable without the native module (tests inject
// their own factory). The require is lazy and wrapped.
export function createLiveKitRoom(opts: Record<string, unknown>): LkRoom {
  registerVoiceGlobals();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const livekit = require('@livekit/react-native') as {
    Room: new (opts: Record<string, unknown>) => unknown;
    RoomEvent: Record<string, string>;
  };
  const room = new livekit.Room(opts) as LkRoom;
  return room;
}
