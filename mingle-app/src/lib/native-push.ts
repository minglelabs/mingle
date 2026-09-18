import { buildClientApiPath, clientApiNamespace } from "@/lib/api-contract";

export const NATIVE_PUSH_TOKEN_EVENT = "mingle:native-push-token";
const NATIVE_PUSH_STORAGE_KEY = "mingle.nativePush.registration";

export type NativePushRegistration = {
  token: string;
  installationId: string;
  platform: "ios" | "android";
  environment: "sandbox" | "production";
  permission: string;
  appVersion: string;
  apiNamespace: string;
};

export function isNativePushBridgeAvailable(): boolean {
  return typeof window !== "undefined"
    && typeof window.ReactNativeWebView?.postMessage === "function";
}

export function postNativePushRegister(): void {
  if (!isNativePushBridgeAvailable()) return;
  try {
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: "native_push_register" }));
  } catch {
    // Native push registration is best effort and must not affect the app shell.
  }
}

export function normalizeNativePushRegistration(value: unknown): NativePushRegistration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const token = typeof raw.token === "string" ? raw.token.trim() : "";
  const installationId = typeof raw.installationId === "string" ? raw.installationId.trim() : "";
  const rawPlatform = typeof raw.platform === "string" ? raw.platform.trim().toLowerCase() : "";
  if (!token || !installationId || (rawPlatform !== "ios" && rawPlatform !== "android")) return null;

  return {
    token,
    installationId,
    platform: rawPlatform,
    environment: raw.environment === "sandbox" ? "sandbox" : "production",
    permission: typeof raw.permission === "string" ? raw.permission.trim() : "unknown",
    appVersion: typeof raw.appVersion === "string" ? raw.appVersion.trim().slice(0, 64) : "",
    apiNamespace: typeof raw.apiNamespace === "string" ? raw.apiNamespace.trim().slice(0, 64) : "",
  };
}

export function rememberNativePushRegistration(registration: NativePushRegistration): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(NATIVE_PUSH_STORAGE_KEY, JSON.stringify(registration));
  } catch {
    // Storage is an optimization for logout cleanup, not a registration requirement.
  }
}

export async function unregisterNativePushToken(): Promise<void> {
  if (typeof window === "undefined" || !isNativePushBridgeAvailable()) return;

  let registration: NativePushRegistration | null = null;
  try {
    registration = normalizeNativePushRegistration(
      JSON.parse(window.sessionStorage.getItem(NATIVE_PUSH_STORAGE_KEY) || "null"),
    );
  } catch {
    registration = null;
  }
  if (!registration) return;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (registration.appVersion) headers["x-mingle-app-version"] = registration.appVersion;
  if (registration.apiNamespace || clientApiNamespace) {
    headers["x-mingle-api-namespace"] = registration.apiNamespace || clientApiNamespace;
  }

  try {
    const response = await fetch(buildClientApiPath("/push-tokens"), {
      method: "DELETE",
      headers,
      cache: "no-store",
      body: JSON.stringify({
        token: registration.token,
        installationId: registration.installationId,
        platform: registration.platform,
      }),
    });
    if (response.ok) window.sessionStorage.removeItem(NATIVE_PUSH_STORAGE_KEY);
  } catch {
    // Logout must continue even when cleanup cannot reach the server.
  }
}
