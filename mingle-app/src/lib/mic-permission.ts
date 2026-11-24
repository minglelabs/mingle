/**
 * Asks for the microphone on its own, before any transcription starts: the
 * first-run "HashChat is spoken" screen (owner, 2026-11-24). In the app it
 * needs a shell with the `micPermissionRequest` capability (2.6.0+); an older
 * shell cannot ask on its own and the speak trial asks instead, as before.
 */
import { NATIVE_SHELL_CAPABILITIES_STATE_KEY } from "@/lib/native-device-audio";

export type MicPermissionResult = "granted" | "denied" | "blocked" | "unavailable";

const NATIVE_STT_EVENT = "mingle:native-stt";
const NATIVE_ANSWER_TIMEOUT_MS = 60_000;

type NativeWindow = Window & {
  ReactNativeWebView?: { postMessage?: (message: string) => void };
  [NATIVE_SHELL_CAPABILITIES_STATE_KEY]?: unknown;
};

function nativeBridge(): NativeWindow["ReactNativeWebView"] | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as NativeWindow).ReactNativeWebView;
  return typeof bridge?.postMessage === "function" ? bridge : null;
}

export function parseMicPermissionCapability(detail: unknown): boolean {
  if (typeof detail !== "object" || detail === null) return false;
  const record = detail as Record<string, unknown>;
  return record.type === "capabilities" && record.micPermissionRequest === true;
}

/** Whether this screen can ask for the microphone right now. */
export function canAskMicPermission(): boolean {
  if (typeof window === "undefined") return false;
  if (nativeBridge()) return parseMicPermissionCapability((window as NativeWindow)[NATIVE_SHELL_CAPABILITIES_STATE_KEY]);
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

export function normalizeMicPermission(value: unknown): MicPermissionResult {
  return value === "granted" || value === "denied" || value === "blocked" ? value : "unavailable";
}

export async function requestMicPermission(): Promise<MicPermissionResult> {
  if (!canAskMicPermission()) return "unavailable";
  const bridge = nativeBridge();
  if (bridge) {
    const requestId = `mic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return new Promise<MicPermissionResult>((resolve) => {
      const finish = (result: MicPermissionResult) => {
        window.removeEventListener(NATIVE_STT_EVENT, onEvent);
        window.clearTimeout(timer);
        resolve(result);
      };
      const onEvent = (event: Event) => {
        const detail = (event as CustomEvent).detail as Record<string, unknown> | null;
        if (detail?.type !== "permission" || detail.requestId !== requestId) return;
        finish(normalizeMicPermission(detail.permission));
      };
      const timer = window.setTimeout(() => finish("unavailable"), NATIVE_ANSWER_TIMEOUT_MS);
      window.addEventListener(NATIVE_STT_EVENT, onEvent);
      try {
        bridge.postMessage?.(JSON.stringify({ type: "native_mic_permission_request", payload: { requestId } }));
      } catch {
        finish("unavailable");
      }
    });
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return "granted";
  } catch (error) {
    return error instanceof DOMException && error.name === "NotAllowedError" ? "denied" : "unavailable";
  }
}
