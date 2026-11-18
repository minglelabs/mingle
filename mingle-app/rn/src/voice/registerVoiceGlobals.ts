// LiveKit RN requires its WebRTC globals registered once, before any Room is
// created. Call registerVoiceGlobals() at module import of the voice entry.
//
// Kept in its own module (and defensively wrapped) so a missing native module
// during Metro/Jest never throws at import time of the pure logic modules.

let registered = false;

export function registerVoiceGlobals(): void {
  if (registered) return;
  registered = true;
  try {
    // Lazy require: the pure logic + tests must not pull in the native WebRTC
    // module. Only the app entry that actually connects calls this.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const livekit = require('@livekit/react-native') as { registerGlobals?: () => void };
    livekit.registerGlobals?.();
  } catch (error) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[voice] registerGlobals failed (native module missing?):', error);
    }
  }
}
