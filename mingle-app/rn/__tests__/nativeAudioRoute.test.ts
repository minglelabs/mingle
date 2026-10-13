import {
  NATIVE_AUDIO_ROUTE_CHANGE_DEBOUNCE_MS,
  NATIVE_AUDIO_ROUTE_EVENT,
  NATIVE_AUDIO_ROUTE_STATE_KEY,
  addNativeAudioRouteListener,
  buildNativeAudioRouteEventDetail,
  buildNativeAudioRouteScript,
  createNativeAudioRouteRelay,
  getNativeAudioRoute,
  isNativeAudioRouteAvailable,
  normalizeNativeAudioRouteSnapshot,
  type NativeAudioRouteEventDetail,
  type NativeAudioRouteSnapshot,
} from '../src/nativeAudioRoute';
import { buildNativeShellCapabilities } from '../src/nativeCapabilities';

type MutableReactNative = {
  NativeModules: Record<string, unknown>;
  Platform: { OS: string; Version: string | number };
  NativeEventEmitter: { prototype: { addListener: (...args: unknown[]) => unknown } };
};

const ReactNative = jest.requireMock('react-native') as MutableReactNative;
const INITIAL_PLATFORM = { OS: ReactNative.Platform.OS, Version: ReactNative.Platform.Version };

const CONTRACT_DETAIL_KEYS = [
  'atMs',
  'earphonesConnected',
  'outputTypes',
  'platform',
  'reason',
  'routeKind',
  'type',
];

function snapshot(overrides: Partial<NativeAudioRouteSnapshot> = {}): NativeAudioRouteSnapshot {
  return {
    earphonesConnected: true,
    routeKind: 'bluetooth',
    outputTypes: ['BluetoothA2DPOutput'],
    ...overrides,
  };
}

const connected = (monotonicMs?: number) => snapshot({
  ...(monotonicMs !== undefined ? { monotonicMs } : {}),
});
const disconnected = (monotonicMs?: number) => snapshot({
  earphonesConnected: false,
  routeKind: 'speaker',
  outputTypes: ['Speaker'],
  ...(monotonicMs !== undefined ? { monotonicMs } : {}),
});

function runInjectedScript(script: string) {
  const fakeWindow: Record<string, unknown> = {};
  const dispatched: { type: string; detail: unknown; cachedAtDispatch: unknown }[] = [];
  class FakeCustomEvent {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  }
  fakeWindow.dispatchEvent = (event: FakeCustomEvent) => {
    dispatched.push({
      type: event.type,
      detail: event.detail,
      cachedAtDispatch: fakeWindow[NATIVE_AUDIO_ROUTE_STATE_KEY],
    });
    return true;
  };
  // eslint-disable-next-line no-new-func
  new Function('window', 'CustomEvent', script)(fakeWindow, FakeCustomEvent);
  return { fakeWindow, dispatched };
}

function createHarness(options: {
  readRoute?: () => Promise<NativeAudioRouteSnapshot | null>;
  pageReady?: () => boolean;
} = {}) {
  const delivered: NativeAudioRouteEventDetail[] = [];
  let clock = 1_000;
  const readRoute = jest.fn(options.readRoute ?? (async () => connected()));
  const relay = createNativeAudioRouteRelay({
    platform: 'ios',
    readRoute,
    now: () => clock,
    deliver: (detail) => {
      if (options.pageReady && !options.pageReady()) return false;
      delivered.push(detail);
      return true;
    },
  });
  return {
    relay,
    delivered,
    readRoute,
    tick: (ms: number) => {
      clock += ms;
      jest.advanceTimersByTime(ms);
    },
  };
}

describe('capabilities message (contract A.1)', () => {
  it('adds audioRoute next to openAppSettings', () => {
    expect(buildNativeShellCapabilities({ audioRoute: true })).toEqual({
      type: 'capabilities',
      openAppSettings: true,
      audioRoute: true,
      deviceAudioCapture: false,
    });
    expect(buildNativeShellCapabilities({ audioRoute: false })).toEqual({
      type: 'capabilities',
      openAppSettings: true,
      audioRoute: false,
      deviceAudioCapture: false,
    });
  });

  it('reports device-audio capture only when the shell says it can', () => {
    expect(buildNativeShellCapabilities({ audioRoute: false, deviceAudioCapture: true })).toEqual({
      type: 'capabilities',
      openAppSettings: true,
      audioRoute: false,
      deviceAudioCapture: true,
    });
  });
});

describe('native audio route module access', () => {
  afterEach(() => {
    delete ReactNative.NativeModules.NativeAudioRouteModule;
    ReactNative.Platform.OS = INITIAL_PLATFORM.OS;
    ReactNative.Platform.Version = INITIAL_PLATFORM.Version;
    jest.restoreAllMocks();
  });

  it('reports no capability and no readings when the native module is missing', async () => {
    expect(isNativeAudioRouteAvailable()).toBe(false);
    await expect(getNativeAudioRoute()).resolves.toBeNull();
    const subscription = addNativeAudioRouteListener(jest.fn());
    expect(() => subscription.remove()).not.toThrow();
  });

  it('reports the capability only on iOS and Android with the module present', () => {
    ReactNative.NativeModules.NativeAudioRouteModule = {
      getAudioRoute: jest.fn(async () => ({})),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };
    expect(isNativeAudioRouteAvailable()).toBe(true);
    ReactNative.Platform.OS = 'android';
    ReactNative.Platform.Version = 33;
    expect(isNativeAudioRouteAvailable()).toBe(true);
    ReactNative.Platform.Version = 32;
    expect(isNativeAudioRouteAvailable()).toBe(false);
    ReactNative.Platform.Version = 29;
    expect(isNativeAudioRouteAvailable()).toBe(false);
    ReactNative.Platform.Version = Number.NaN;
    expect(isNativeAudioRouteAvailable()).toBe(false);
    ReactNative.Platform.OS = 'web';
    expect(isNativeAudioRouteAvailable()).toBe(false);
  });

  it('normalizes getAudioRoute() and ignores a malformed reading', async () => {
    const getAudioRoute = jest.fn()
      .mockResolvedValueOnce({
        earphonesConnected: true,
        routeKind: 'wired',
        outputTypes: ['Headphones'],
        monotonicMs: 12.5,
      })
      .mockResolvedValueOnce({ earphonesConnected: 'yes', routeKind: 'wired' });
    ReactNative.NativeModules.NativeAudioRouteModule = {
      getAudioRoute,
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };

    await expect(getNativeAudioRoute()).resolves.toEqual({
      earphonesConnected: true,
      routeKind: 'wired',
      outputTypes: ['Headphones'],
      monotonicMs: 12.5,
    });
    await expect(getNativeAudioRoute()).resolves.toBeNull();
  });

  it('subscribes to audioRouteChanged and forwards only valid readings', () => {
    const registered: { eventName: unknown; handler: (raw: unknown) => void }[] = [];
    jest.spyOn(ReactNative.NativeEventEmitter.prototype, 'addListener')
      .mockImplementation((eventName: unknown, handler: unknown) => {
        registered.push({ eventName, handler: handler as (raw: unknown) => void });
        return { remove: jest.fn() };
      });
    ReactNative.NativeModules.NativeAudioRouteModule = {
      getAudioRoute: jest.fn(async () => ({})),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };
    const listener = jest.fn();

    addNativeAudioRouteListener(listener);
    expect(registered).toHaveLength(1);
    expect(registered[0].eventName).toBe('audioRouteChanged');

    registered[0].handler({ earphonesConnected: false, routeKind: 'speaker', outputTypes: ['Speaker'], reason: 'old_device_unavailable' });
    registered[0].handler({ routeKind: 'speaker' });
    registered[0].handler(null);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      earphonesConnected: false,
      routeKind: 'speaker',
      outputTypes: ['Speaker'],
      reason: 'old_device_unavailable',
    });
  });
});

describe('route event shape (contract A.2)', () => {
  it('sanitizes native readings without inventing a connection', () => {
    expect(normalizeNativeAudioRouteSnapshot({
      earphonesConnected: false,
      routeKind: 'spaceship',
      outputTypes: ['Speaker', 'Speaker', 42, '', '  Receiver  '],
      reason: '  category_change ',
    })).toEqual({
      earphonesConnected: false,
      routeKind: 'other',
      outputTypes: ['Speaker', 'Receiver'],
      reason: 'category_change',
    });
    expect(normalizeNativeAudioRouteSnapshot({ earphonesConnected: 1, routeKind: 'wired' })).toBeNull();
    expect(normalizeNativeAudioRouteSnapshot('connected')).toBeNull();
    expect(normalizeNativeAudioRouteSnapshot([true])).toBeNull();
  });

  it('builds exactly the contract fields and keeps the native clock out of it', () => {
    const detail = buildNativeAudioRouteEventDetail(
      snapshot({ reason: 'new_device_available', monotonicMs: 99 }),
      'android',
      1_700_000_000_000,
    );
    expect(detail).toEqual({
      type: 'audio_route',
      platform: 'android',
      earphonesConnected: true,
      routeKind: 'bluetooth',
      outputTypes: ['BluetoothA2DPOutput'],
      reason: 'new_device_available',
      atMs: 1_700_000_000_000,
    });
    expect(Object.keys(detail).sort()).toEqual(CONTRACT_DETAIL_KEYS);

    const withoutReason = buildNativeAudioRouteEventDetail(snapshot(), 'ios', 5);
    expect('reason' in withoutReason).toBe(false);
  });

  it('assigns the global cache before dispatching that same object', () => {
    const detail = buildNativeAudioRouteEventDetail(disconnected(), 'ios', 42);
    const { fakeWindow, dispatched } = runInjectedScript(buildNativeAudioRouteScript(detail));

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe(NATIVE_AUDIO_ROUTE_EVENT);
    expect(dispatched[0].type).toBe('mingle:native-audio-route');
    expect(dispatched[0].detail).toEqual(detail);
    expect(dispatched[0].cachedAtDispatch).toBe(dispatched[0].detail);
    expect(fakeWindow.__MINGLE_LAST_NATIVE_AUDIO_ROUTE).toBe(dispatched[0].detail);
  });
});

describe('route relay (contract A.2 a-c)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends the first reading at once, tagged initial', async () => {
    const { relay, delivered } = createHarness();
    await relay.syncInitial();
    expect(delivered).toEqual([{
      type: 'audio_route',
      platform: 'ios',
      earphonesConnected: true,
      routeKind: 'bluetooth',
      outputTypes: ['BluetoothA2DPOutput'],
      reason: 'initial',
      atMs: 1_000,
    }]);
  });

  it('debounces a connect by ~250 ms and coalesces a burst into the last state', async () => {
    const { relay, delivered, tick } = createHarness({ readRoute: async () => disconnected() });
    await relay.syncInitial();
    expect(delivered).toHaveLength(1);

    relay.handleSnapshot(snapshot({ routeKind: 'bluetooth', outputTypes: ['BluetoothHFP'] }));
    tick(100);
    relay.handleSnapshot(snapshot({ routeKind: 'wired', outputTypes: ['Headphones'] }));
    tick(NATIVE_AUDIO_ROUTE_CHANGE_DEBOUNCE_MS - 1);
    expect(delivered).toHaveLength(1);

    tick(1);
    expect(delivered).toHaveLength(2);
    expect(delivered[1]).toMatchObject({ earphonesConnected: true, routeKind: 'wired' });
  });

  it('sends a disconnect immediately and drops the pending change it overtook', async () => {
    const { relay, delivered, tick } = createHarness();
    await relay.syncInitial();

    relay.handleSnapshot(snapshot({ routeKind: 'wired', outputTypes: ['Headphones'] }));
    tick(50);
    relay.handleSnapshot(disconnected());
    expect(delivered).toHaveLength(2);
    expect(delivered[1]).toMatchObject({ earphonesConnected: false, routeKind: 'speaker' });

    tick(1_000);
    expect(delivered).toHaveLength(2);
  });

  it('sends a speaker switch found by foreground polling immediately', async () => {
    const { relay, delivered } = createHarness();
    await relay.syncInitial();

    // The Bluetooth device may stay connected while Android selects the
    // speaker for media, so the media-route query no longer lists Bluetooth.
    relay.handleSnapshot(snapshot({
      earphonesConnected: false,
      routeKind: 'speaker',
      outputTypes: ['Speaker'],
      reason: 'foreground_poll',
    }));

    expect(delivered).toHaveLength(2);
    expect(delivered[1]).toMatchObject({
      earphonesConnected: false,
      routeKind: 'speaker',
      reason: 'foreground_poll',
    });
  });

  it('sends nothing for a flap back to the delivered state or an unchanged kind', async () => {
    const { relay, delivered, tick } = createHarness({ readRoute: async () => disconnected() });
    await relay.syncInitial();

    relay.handleSnapshot(connected());
    tick(100);
    relay.handleSnapshot(disconnected());
    relay.handleSnapshot(snapshot({ earphonesConnected: false, routeKind: 'speaker', outputTypes: ['Speaker', 'HDMI'] }));
    tick(1_000);
    expect(delivered).toHaveLength(1);
  });

  it('debounces non-earphone route changes too', async () => {
    const { relay, delivered, tick } = createHarness({ readRoute: async () => disconnected() });
    await relay.syncInitial();

    relay.handleSnapshot(snapshot({ earphonesConnected: false, routeKind: 'receiver', outputTypes: ['Receiver'] }));
    expect(delivered).toHaveLength(1);
    tick(NATIVE_AUDIO_ROUTE_CHANGE_DEBOUNCE_MS);
    expect(delivered[1]).toMatchObject({ earphonesConnected: false, routeKind: 'receiver' });
  });

  it('answers a request with a fresh reading even when nothing changed', async () => {
    const { relay, delivered, readRoute } = createHarness();
    await relay.syncInitial();
    await relay.handleRequest();

    expect(readRoute).toHaveBeenCalledTimes(2);
    expect(delivered).toHaveLength(2);
    expect(delivered[1]).toMatchObject({ earphonesConnected: true, reason: 'request' });
  });

  it('lets a request reply supersede a pending debounced change', async () => {
    const reads = [disconnected(), connected()];
    const { relay, delivered, tick } = createHarness({ readRoute: async () => reads.shift() ?? null });
    await relay.syncInitial();

    relay.handleSnapshot(connected());
    await relay.handleRequest();
    expect(delivered).toHaveLength(2);
    expect(delivered[1]).toMatchObject({ earphonesConnected: true, reason: 'request' });

    tick(1_000);
    expect(delivered).toHaveLength(2);
  });

  it('answers a request with the held reading when the re-read fails', async () => {
    let fail = false;
    const { relay, delivered } = createHarness({
      readRoute: async () => {
        if (fail) throw new Error('read failed');
        return disconnected();
      },
    });
    await relay.syncInitial();
    fail = true;
    await relay.handleRequest();

    expect(delivered).toHaveLength(2);
    expect(delivered[1]).toMatchObject({ earphonesConnected: false, reason: 'initial' });
  });

  it('sends nothing for a request before any reading exists', async () => {
    const { relay, delivered } = createHarness({ readRoute: async () => null });
    await relay.handleRequest();
    expect(delivered).toEqual([]);
  });

  it('never lets an older reading overwrite a newer disconnect', async () => {
    let resolveRead: (value: NativeAudioRouteSnapshot) => void = () => undefined;
    const { relay, delivered } = createHarness({
      readRoute: () => new Promise<NativeAudioRouteSnapshot>((resolve) => {
        resolveRead = resolve;
      }),
    });
    relay.handleSnapshot(connected(100));

    const reply = relay.handleRequest();
    relay.handleSnapshot(disconnected(300));
    resolveRead(connected(200));
    await reply;

    expect(delivered.map((detail) => detail.earphonesConnected)).toEqual([true, false, false]);
    expect(relay.getLatest()).toMatchObject({ earphonesConnected: false });

    relay.handleSnapshot(connected(250));
    expect(relay.getLatest()).toMatchObject({ earphonesConnected: false });
  });

  it('holds readings while the page cannot receive them and replays the latest at load end', async () => {
    let pageReady = false;
    const { relay, delivered, tick } = createHarness({ pageReady: () => pageReady });
    await relay.syncInitial();
    relay.handleSnapshot(disconnected());
    tick(1_000);
    expect(delivered).toEqual([]);

    pageReady = true;
    relay.replayLatest();
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ earphonesConnected: false });

    relay.replayLatest();
    expect(delivered).toHaveLength(2);
  });

  it('replays nothing before the first reading and stops after dispose', async () => {
    const { relay, delivered, tick } = createHarness({ readRoute: async () => disconnected() });
    relay.replayLatest();
    expect(delivered).toEqual([]);

    await relay.syncInitial();
    relay.handleSnapshot(connected());
    relay.dispose();
    tick(1_000);
    relay.handleSnapshot(disconnected());
    relay.replayLatest();
    await relay.handleRequest();
    expect(delivered).toHaveLength(1);
  });
});
