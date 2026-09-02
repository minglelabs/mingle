import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

type NativeSttStartOptions = {
  conversationId?: string;
  sessionId?: string;
  wsUrl: string;
  sttModel?: string;
  aecEnabled?: boolean;
  sonioxManualFinalizeSilenceMs?: number;
  sttSegmentationMode?: 'fin' | 'end';
  sonioxEndpointMaxDelayMs?: number;
  sonioxEndpointTuningStep?: number;
};

type NativeSttStopOptions = {
  conversationId?: string;
  sessionId?: string;
  pendingText?: string;
  pendingLanguage?: string;
  force?: boolean;
};

type NativeSttMicrophonePermissionStatus = {
  permission: string;
  platform?: string;
};

type NativeSttStatus = {
  status: string;
  conversationId?: string;
  sessionId?: string;
  serverReady?: boolean;
  running?: boolean;
  stopping?: boolean;
  eventSequence?: number;
};

type NativeSttModuleType = {
  start(options: NativeSttStartOptions): Promise<{ sampleRate: number }>;
  stop(options?: NativeSttStopOptions): Promise<void>;
  setAec(enabled: boolean): Promise<{ ok: boolean }>;
  getMicrophonePermissionStatus(): Promise<NativeSttMicrophonePermissionStatus>;
  getStatus?: () => Promise<NativeSttStatus>;
};

type NativeSttEventMap = {
  status: {
    status: string;
    conversationId?: string;
    sessionId?: string;
    running?: boolean;
    serverReady?: boolean;
    stopping?: boolean;
    eventSequence?: number;
  };
  message: { raw: string; conversationId?: string; sessionId?: string };
  error: { message: string; code?: string; platform?: string; conversationId?: string; sessionId?: string };
  close: { reason: string; conversationId?: string; sessionId?: string };
};

const nativeModule = NativeModules.NativeSTTModule as NativeSttModuleType | undefined;
const nativeEmitter = nativeModule ? new NativeEventEmitter(NativeModules.NativeSTTModule) : null;

export function isNativeSttAvailable(): boolean {
  return (Platform.OS === 'ios' || Platform.OS === 'android') && Boolean(nativeModule && nativeEmitter);
}

export async function startNativeStt(options: NativeSttStartOptions): Promise<{ sampleRate: number }> {
  if (!nativeModule) {
    throw new Error('NativeSTTModule is unavailable on this runtime.');
  }
  return nativeModule.start(options);
}

export async function stopNativeStt(options?: NativeSttStopOptions): Promise<void> {
  if (!nativeModule) {
    return;
  }
  await nativeModule.stop(options || {});
}

export async function setNativeSttAec(enabled: boolean): Promise<void> {
  if (!nativeModule) {
    return;
  }
  await nativeModule.setAec(enabled);
}

export async function getNativeSttMicrophonePermissionStatus(): Promise<NativeSttMicrophonePermissionStatus> {
  if (!nativeModule) {
    return { permission: 'unknown', platform: Platform.OS };
  }
  return nativeModule.getMicrophonePermissionStatus();
}

export async function getNativeSttStatus(): Promise<NativeSttStatus> {
  if (!nativeModule?.getStatus) {
    return { status: 'idle', running: false, serverReady: false };
  }
  return nativeModule.getStatus();
}

export function addNativeSttListener<T extends keyof NativeSttEventMap>(
  eventName: T,
  listener: (event: NativeSttEventMap[T]) => void,
): { remove: () => void } {
  if (!nativeEmitter) {
    return {
      remove: () => {
        // no-op on unsupported runtimes
      },
    };
  }

  const subscription = nativeEmitter.addListener(eventName, listener as (event: unknown) => void);
  return {
    remove: () => subscription.remove(),
  };
}
