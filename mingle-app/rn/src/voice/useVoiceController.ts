import { useSyncExternalStore } from 'react';

import type { VoiceController, VoiceSnapshot } from '../nativeVoice';

/** Subscribes a component to a VoiceController's observable snapshot. */
export function useVoiceSnapshot(controller: VoiceController): VoiceSnapshot {
  return useSyncExternalStore(
    (cb) => controller.subscribe(cb),
    () => controller.getSnapshot(),
    () => controller.getSnapshot(),
  );
}
