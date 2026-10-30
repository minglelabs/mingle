import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import {
  addNativePushOpenedListener,
  createSerialTaskRunner,
  NATIVE_PUSH_OPENED_EVENT,
} from '../src/pushNavigationEvents';

type Listener = (payload: unknown) => void;

describe('addNativePushOpenedListener', () => {
  const modules = NativeModules as Record<string, unknown>;
  const platform = Platform as { OS: string };
  const originalOs = platform.OS;
  let addListenerSpy: jest.SpyInstance;
  let registered: Array<{ event: string; listener: Listener; remove: jest.Mock }>;

  beforeEach(() => {
    registered = [];
    addListenerSpy = jest
      .spyOn(NativeEventEmitter.prototype, 'addListener')
      .mockImplementation(((event: string, listener: Listener) => {
        const entry = { event, listener, remove: jest.fn() };
        registered.push(entry);
        return { remove: entry.remove } as never;
      }) as never);
    modules.NativePushNotificationModule = { getPendingPushTap: jest.fn() };
  });

  afterEach(() => {
    addListenerSpy.mockRestore();
    delete modules.NativePushNotificationModule;
    platform.OS = originalOs;
  });

  it('subscribes to the native "opened" event on iOS and forwards it', () => {
    platform.OS = 'ios';
    const listener = jest.fn();
    const subscription = addNativePushOpenedListener(listener);

    expect(registered).toHaveLength(1);
    expect(registered[0].event).toBe(NATIVE_PUSH_OPENED_EVENT);
    registered[0].listener({ type: 'comment', url: '/ko/feed?postId=p1' });
    expect(listener).toHaveBeenCalledTimes(1);

    subscription.remove();
    expect(registered[0].remove).toHaveBeenCalledTimes(1);
  });

  it('is a no-op on Android (the AppState path covers onNewIntent)', () => {
    platform.OS = 'android';
    const subscription = addNativePushOpenedListener(jest.fn());
    expect(registered).toHaveLength(0);
    expect(() => subscription.remove()).not.toThrow();
  });

  it('is a no-op when the native push module is missing', () => {
    platform.OS = 'ios';
    delete modules.NativePushNotificationModule;
    const subscription = addNativePushOpenedListener(jest.fn());
    expect(registered).toHaveLength(0);
    expect(() => subscription.remove()).not.toThrow();
  });
});

describe('createSerialTaskRunner', () => {
  it('runs tasks one at a time so a read cannot race the previous clear', async () => {
    const run = createSerialTaskRunner();
    const log: string[] = [];
    let slot: string | null = 'tap-1';
    const consume = (label: string) => async () => {
      const seen = slot;
      log.push(`${label}:read:${seen ?? 'none'}`);
      await Promise.resolve();
      await Promise.resolve();
      if (seen) {
        log.push(`${label}:navigate:${seen}`);
        slot = null;
      }
    };

    await Promise.all([run(consume('a')), run(consume('b')), run(consume('c'))]);

    expect(log).toEqual(['a:read:tap-1', 'a:navigate:tap-1', 'b:read:none', 'c:read:none']);
  });

  it('keeps running later tasks after one rejects', async () => {
    const run = createSerialTaskRunner();
    const later = jest.fn(async () => undefined);
    await run(async () => {
      throw new Error('native read failed');
    });
    await run(later);
    expect(later).toHaveBeenCalledTimes(1);
  });
});
