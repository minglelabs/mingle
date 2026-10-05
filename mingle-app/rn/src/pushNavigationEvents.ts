import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

/**
 * Live "notification opened" signal for a push tap that happens while the app
 * is already in the foreground.
 *
 * Cold-start and background→foreground taps are consumed from the native
 * pending-tap slot when the app mounts or `AppState` becomes `active`. A tap on
 * a banner shown while the app is ACTIVE (iOS `willPresent` → `didReceive`)
 * never changes `AppState`, so without this listener that tap would sit in the
 * pending slot until the next background/foreground cycle. iOS emits `opened`
 * from `NativePushNotificationModule.didReceiveNotification` right after it
 * records the pending slot; the listener only signals "go consume the slot" so
 * the slot stays the single source of truth (no double navigation).
 *
 * Android delivers a foreground tap through `onNewIntent`, which pauses and
 * resumes the activity, so the existing `AppState` path already covers it.
 */
export const NATIVE_PUSH_OPENED_EVENT = 'opened';

type Subscription = { remove: () => void };

const NOOP_SUBSCRIPTION: Subscription = {
  remove: () => {
    // no-op on unsupported runtimes
  },
};

export function addNativePushOpenedListener(listener: () => void): Subscription {
  const nativeModule = (NativeModules as { NativePushNotificationModule?: object })
    .NativePushNotificationModule;
  if (Platform.OS !== 'ios' || !nativeModule) {
    return NOOP_SUBSCRIPTION;
  }

  try {
    const emitter = new NativeEventEmitter(nativeModule as never);
    const subscription = emitter.addListener(NATIVE_PUSH_OPENED_EVENT, () => listener());
    return { remove: () => subscription.remove() };
  } catch {
    return NOOP_SUBSCRIPTION;
  }
}

/**
 * Run async tasks strictly one after another. The pending push-tap slot is
 * read several times in quick succession (mount, retries, `AppState`, the
 * `opened` event); running those reads concurrently lets two of them see the
 * same tap before either clears it, which would route the tap twice. A failed
 * task does not break the chain.
 */
export function createSerialTaskRunner(): (task: () => Promise<void>) => Promise<void> {
  let tail: Promise<void> = Promise.resolve();
  return (task) => {
    const next = tail.then(task, task);
    tail = next.catch(() => undefined);
    return tail;
  };
}
