import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export type NativePipEvent =
  | { type: 'started'; conversationId: string }
  | { type: 'stopped'; conversationId?: string }
  | { type: 'failed'; conversationId?: string; message?: string }
  | { type: 'playback_control'; conversationId: string; playing: boolean };

const NATIVE_PIP_EVENT_NAME = 'pictureInPicture';
const nativeModule = NativeModules.NativePictureInPictureModule as object | undefined;
const nativeEmitter = nativeModule
  ? new NativeEventEmitter(NativeModules.NativePictureInPictureModule)
  : null;

export function addNativePipListener(
  listener: (event: NativePipEvent) => void,
): { remove: () => void } {
  if (Platform.OS !== 'ios' || !nativeEmitter) {
    return {
      remove: () => {
        // no-op on unsupported runtimes
      },
    };
  }

  const subscription = nativeEmitter.addListener(
    NATIVE_PIP_EVENT_NAME,
    listener as (event: unknown) => void,
  );
  return {
    remove: () => subscription.remove(),
  };
}
