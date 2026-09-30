import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

// Earphone mode bridge (contract v1, sections A.1, A.2 and A.4). The native
// NativeAudioRouteModule only reports readings; this file owns everything the
// WebView sees: the event shape, the late-reader cache and the change rules.

/** Window CustomEvent carrying the current audio output route. */
export const NATIVE_AUDIO_ROUTE_EVENT = 'mingle:native-audio-route';
/** Global assigned (same object) right before the event is dispatched, for late readers. */
export const NATIVE_AUDIO_ROUTE_STATE_KEY = '__MINGLE_LAST_NATIVE_AUDIO_ROUTE';
/** Route changes are coalesced this long (Bluetooth connects arrive in bursts). A disconnect is never delayed. */
export const NATIVE_AUDIO_ROUTE_CHANGE_DEBOUNCE_MS = 250;

const NATIVE_AUDIO_ROUTE_CHANGED_EVENT_NAME = 'audioRouteChanged';
const MAX_OUTPUT_TYPES = 16;
const MAX_LABEL_LENGTH = 64;

export const NATIVE_AUDIO_ROUTE_KINDS = [
  'wired',
  'bluetooth',
  'usb',
  'hearing_aid',
  'speaker',
  'receiver',
  'car',
  'airplay',
  'hdmi',
  'other',
  'none',
] as const;

export type NativeAudioRouteKind = (typeof NATIVE_AUDIO_ROUTE_KINDS)[number];

export type NativeAudioRoutePlatform = 'ios' | 'android';

/** One reading from NativeAudioRouteModule (getAudioRoute() result or audioRouteChanged event). */
export type NativeAudioRouteSnapshot = {
  earphonesConnected: boolean;
  routeKind: NativeAudioRouteKind;
  /** Output port/device TYPE identifiers only. Device names never cross the bridge. */
  outputTypes: string[];
  reason?: string;
  /**
   * Native monotonic clock (ms) at which the reading was taken. Internal to the
   * native <-> RN hop: it lets the relay drop a reading that is older than one it
   * already has, and it never reaches the WebView.
   */
  monotonicMs?: number;
};

/** `detail` of the `mingle:native-audio-route` event (contract A.2). */
export type NativeAudioRouteEventDetail = {
  type: 'audio_route';
  platform: NativeAudioRoutePlatform;
  earphonesConnected: boolean;
  routeKind: NativeAudioRouteKind;
  outputTypes: string[];
  reason?: string;
  atMs: number;
};

type NativeAudioRouteModuleType = {
  getAudioRoute(): Promise<unknown>;
  addListener?: (eventName: string) => void;
  removeListeners?: (count: number) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeLabel(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_LABEL_LENGTH);
}

function isNativeAudioRouteKind(value: string): value is NativeAudioRouteKind {
  return (NATIVE_AUDIO_ROUTE_KINDS as readonly string[]).includes(value);
}

/**
 * Validates a raw native reading. Returns null (the reading is ignored) unless
 * `earphonesConnected` is a real boolean, so a malformed reading can never be
 * mistaken for "connected".
 */
export function normalizeNativeAudioRouteSnapshot(raw: unknown): NativeAudioRouteSnapshot | null {
  if (!isRecord(raw) || typeof raw.earphonesConnected !== 'boolean') return null;

  const rawKind = normalizeLabel(raw.routeKind);
  const routeKind: NativeAudioRouteKind = isNativeAudioRouteKind(rawKind) ? rawKind : 'other';
  const outputTypes: string[] = [];
  if (Array.isArray(raw.outputTypes)) {
    for (const entry of raw.outputTypes) {
      const label = normalizeLabel(entry);
      if (label && !outputTypes.includes(label)) outputTypes.push(label);
      if (outputTypes.length >= MAX_OUTPUT_TYPES) break;
    }
  }
  const reason = normalizeLabel(raw.reason);
  const monotonicMs = typeof raw.monotonicMs === 'number' && Number.isFinite(raw.monotonicMs)
    ? raw.monotonicMs
    : undefined;

  return {
    earphonesConnected: raw.earphonesConnected,
    routeKind,
    outputTypes,
    ...(reason ? { reason } : {}),
    ...(monotonicMs !== undefined ? { monotonicMs } : {}),
  };
}

export function resolveNativeAudioRoutePlatform(os: string = Platform.OS): NativeAudioRoutePlatform | null {
  return os === 'ios' || os === 'android' ? os : null;
}

function readNativeAudioRouteModule(): NativeAudioRouteModuleType | null {
  const candidate = (NativeModules as Record<string, unknown>).NativeAudioRouteModule;
  if (!isRecord(candidate) || typeof candidate.getAudioRoute !== 'function') return null;
  return candidate as unknown as NativeAudioRouteModuleType;
}

let cachedEmitter: { module: NativeAudioRouteModuleType; emitter: NativeEventEmitter } | null = null;

function resolveNativeAudioRouteEmitter(module: NativeAudioRouteModuleType): NativeEventEmitter {
  if (!cachedEmitter || cachedEmitter.module !== module) {
    cachedEmitter = {
      module,
      emitter: new NativeEventEmitter(module as unknown as ConstructorParameters<typeof NativeEventEmitter>[0]),
    };
  }
  return cachedEmitter.emitter;
}

/** True when this shell can report earphones (drives `capabilities.audioRoute`). */
export function isNativeAudioRouteAvailable(): boolean {
  return resolveNativeAudioRoutePlatform() !== null && readNativeAudioRouteModule() !== null;
}

/** Reads the current route, or null when the module is missing or the reading is malformed. */
export async function getNativeAudioRoute(): Promise<NativeAudioRouteSnapshot | null> {
  const module = readNativeAudioRouteModule();
  if (!module || !resolveNativeAudioRoutePlatform()) return null;
  return normalizeNativeAudioRouteSnapshot(await module.getAudioRoute());
}

export function addNativeAudioRouteListener(
  listener: (snapshot: NativeAudioRouteSnapshot) => void,
): { remove: () => void } {
  const module = readNativeAudioRouteModule();
  if (!module || !resolveNativeAudioRoutePlatform()) {
    return {
      remove: () => {
        // no-op on unsupported runtimes
      },
    };
  }

  const subscription = resolveNativeAudioRouteEmitter(module).addListener(
    NATIVE_AUDIO_ROUTE_CHANGED_EVENT_NAME,
    (raw: unknown) => {
      const snapshot = normalizeNativeAudioRouteSnapshot(raw);
      if (snapshot) listener(snapshot);
    },
  );
  return {
    remove: () => subscription.remove(),
  };
}

export function buildNativeAudioRouteEventDetail(
  snapshot: NativeAudioRouteSnapshot,
  platform: NativeAudioRoutePlatform,
  atMs: number,
): NativeAudioRouteEventDetail {
  return {
    type: 'audio_route',
    platform,
    earphonesConnected: snapshot.earphonesConnected,
    routeKind: snapshot.routeKind,
    outputTypes: [...snapshot.outputTypes],
    ...(snapshot.reason ? { reason: snapshot.reason } : {}),
    atMs,
  };
}

/** Script injected into the WebView: cache the detail globally, then dispatch that same object. */
export function buildNativeAudioRouteScript(detail: NativeAudioRouteEventDetail): string {
  const serialized = JSON.stringify(detail);
  return `(function () { var detail = ${serialized}; window[${JSON.stringify(NATIVE_AUDIO_ROUTE_STATE_KEY)}] = detail; window.dispatchEvent(new CustomEvent(${JSON.stringify(NATIVE_AUDIO_ROUTE_EVENT)}, { detail: detail })); })(); true;`;
}

/** Only these two fields decide whether the web must hear about a change (contract A.2b). */
export function isSameNativeAudioRouteState(
  left: Pick<NativeAudioRouteEventDetail, 'earphonesConnected' | 'routeKind'>,
  right: Pick<NativeAudioRouteEventDetail, 'earphonesConnected' | 'routeKind'>,
): boolean {
  return left.earphonesConnected === right.earphonesConnected && left.routeKind === right.routeKind;
}

export type NativeAudioRouteRelay = {
  /** A reading pushed by the native module. Sent per the change rules (contract A.2b). */
  handleSnapshot: (snapshot: NativeAudioRouteSnapshot) => void;
  /** Reads the route once at mount and applies the change rules (the first reading is sent at once). */
  syncInitial: () => Promise<void>;
  /** Reply to `native_audio_route_request`: re-read now and always send (contract A.2c / A.4). */
  handleRequest: () => Promise<void>;
  /** Re-send the latest reading unconditionally: every WebView load end, right after capabilities (A.2a). */
  replayLatest: () => void;
  getLatest: () => NativeAudioRouteEventDetail | null;
  dispose: () => void;
};

export type NativeAudioRouteRelayOptions = {
  platform: NativeAudioRoutePlatform;
  readRoute: () => Promise<NativeAudioRouteSnapshot | null>;
  /** Sends one detail to the current page. Returns false when the page cannot receive it yet. */
  deliver: (detail: NativeAudioRouteEventDetail) => boolean;
  now?: () => number;
  debounceMs?: number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export function createNativeAudioRouteRelay(options: NativeAudioRouteRelayOptions): NativeAudioRouteRelay {
  const now = options.now ?? Date.now;
  const debounceMs = options.debounceMs ?? NATIVE_AUDIO_ROUTE_CHANGE_DEBOUNCE_MS;
  const setTimer = options.setTimer ?? ((callback: () => void, delayMs: number) => setTimeout(callback, delayMs));
  const clearTimer = options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let latest: NativeAudioRouteEventDetail | null = null;
  let latestMonotonicMs: number | null = null;
  // What the current page last received. Only a successful delivery updates it,
  // so a reading dropped while the page was loading is re-sent at load end.
  let lastDelivered: NativeAudioRouteEventDetail | null = null;
  let pendingTimer: unknown = null;
  let disposed = false;

  const cancelPending = () => {
    if (pendingTimer === null) return;
    clearTimer(pendingTimer);
    pendingTimer = null;
  };

  const deliver = (detail: NativeAudioRouteEventDetail) => {
    if (disposed) return;
    if (options.deliver(detail)) lastDelivered = detail;
  };

  const readSafely = async (): Promise<NativeAudioRouteSnapshot | null> => {
    try {
      return await options.readRoute();
    } catch {
      return null;
    }
  };

  // Returns false for a reading older than the one already held: native readings
  // can reach JS out of order (promise reply vs. event), and a stale "connected"
  // after a real disconnect must never win.
  const accept = (snapshot: NativeAudioRouteSnapshot, reasonOverride?: string): boolean => {
    if (typeof snapshot.monotonicMs === 'number') {
      if (latestMonotonicMs !== null && snapshot.monotonicMs < latestMonotonicMs) return false;
      latestMonotonicMs = snapshot.monotonicMs;
    }
    const reading = reasonOverride ? { ...snapshot, reason: reasonOverride } : snapshot;
    latest = buildNativeAudioRouteEventDetail(reading, options.platform, now());
    return true;
  };

  const flushPending = () => {
    pendingTimer = null;
    if (disposed || !latest) return;
    if (lastDelivered && isSameNativeAudioRouteState(latest, lastDelivered)) return;
    deliver(latest);
  };

  const applyChangeRules = () => {
    const current = latest;
    if (!current) return;
    if (!lastDelivered) {
      cancelPending();
      deliver(current);
      return;
    }
    if (isSameNativeAudioRouteState(current, lastDelivered)) {
      // Back to what the page already has (for example a Bluetooth flap):
      // nothing to send, and a pending change is void.
      cancelPending();
      return;
    }
    if (lastDelivered.earphonesConnected && !current.earphonesConnected) {
      // Disconnect: immediately, so auto-read can stop before the speaker takes over.
      cancelPending();
      deliver(current);
      return;
    }
    cancelPending();
    pendingTimer = setTimer(flushPending, debounceMs);
  };

  return {
    handleSnapshot: (snapshot) => {
      if (disposed || !accept(snapshot)) return;
      applyChangeRules();
    },
    syncInitial: async () => {
      const snapshot = await readSafely();
      if (disposed || !snapshot) return;
      if (!accept(snapshot, snapshot.reason || 'initial')) return;
      applyChangeRules();
    },
    handleRequest: async () => {
      const snapshot = await readSafely();
      if (disposed) return;
      // A stale or failed re-read still answers, with the newest reading held.
      if (snapshot) accept(snapshot, 'request');
      if (!latest) return;
      cancelPending();
      deliver(latest);
    },
    replayLatest: () => {
      if (disposed || !latest) return;
      cancelPending();
      deliver(latest);
    },
    getLatest: () => latest,
    dispose: () => {
      disposed = true;
      cancelPending();
    },
  };
}
