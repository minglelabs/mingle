export const NATIVE_LOCATION_EVENT = "mingle:native-location";

export type NativeLocationPermission =
  | "granted"
  | "denied"
  | "blocked"
  | "not_determined"
  | "unavailable"
  | "unknown";

export type NativeLocationEvent =
  | {
      type: "permission";
      permission: NativeLocationPermission;
      requestId?: string;
      platform?: string;
    }
  | {
      type: "location";
      latitude: number;
      longitude: number;
      accuracy?: number | null;
      requestId?: string;
    }
  | {
      type: "error";
      code: string;
      requestId?: string;
    };

type NativeLocationWindow = Window & {
  ReactNativeWebView?: {
    postMessage?: (message: string) => void;
  };
};

function getNativeLocationWindow(): NativeLocationWindow | null {
  return typeof window === "undefined" ? null : window as NativeLocationWindow;
}

function postNativeLocationCommand(type: string, requestId?: string): boolean {
  const bridge = getNativeLocationWindow()?.ReactNativeWebView;
  if (typeof bridge?.postMessage !== "function") return false;
  try {
    bridge.postMessage(JSON.stringify({
      type,
      ...(requestId ? { payload: { requestId } } : {}),
    }));
    return true;
  } catch {
    return false;
  }
}

export function isNativeLocationBridgeAvailable(): boolean {
  return Boolean(getNativeLocationWindow()?.ReactNativeWebView?.postMessage);
}

export function postNativeLocationPermissionCheck(requestId?: string): boolean {
  return postNativeLocationCommand("native_location_check", requestId);
}

export function postNativeLocationRequest(requestId?: string): boolean {
  return postNativeLocationCommand("native_location_request", requestId);
}

export function postNativeLocationSettings(): boolean {
  return postNativeLocationCommand("native_open_app_settings");
}

export function subscribeNativeLocation(
  handler: (event: NativeLocationEvent) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const listener = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (!detail || typeof detail !== "object") return;
    handler(detail as NativeLocationEvent);
  };
  window.addEventListener(NATIVE_LOCATION_EVENT, listener);
  return () => window.removeEventListener(NATIVE_LOCATION_EVENT, listener);
}

export async function readBrowserLocationPermission(): Promise<NativeLocationPermission> {
  if (typeof navigator === "undefined") return "unknown";
  const permissions = navigator.permissions;
  if (!permissions?.query) return "unknown";

  try {
    const status = await permissions.query({ name: "geolocation" as PermissionName });
    if (status.state === "granted") return "granted";
    if (status.state === "denied") return "denied";
    return "not_determined";
  } catch {
    return "unknown";
  }
}

export function getBrowserCurrentLocation(): Promise<{
  latitude: number;
  longitude: number;
  accuracy: number | null;
}> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("location_unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
      }),
      (error) => reject(error),
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 0 },
    );
  });
}
