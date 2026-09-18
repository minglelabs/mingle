const STORAGE_KEY = "mingle:native-auth-attempt:v1";
export const NATIVE_AUTH_ATTEMPT_TTL_MS = 180_000;

export type NativeAuthAttempt = {
  requestId: string;
  provider: "google" | "apple";
  startedAt: number;
};

export function readNativeAuthAttempt(): NativeAuthAttempt | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "null");
    if (value
      && typeof value.requestId === "string"
      && /^[A-Za-z0-9_-]{12,128}$/.test(value.requestId)
      && (value.provider === "google" || value.provider === "apple")
      && typeof value.startedAt === "number"
      && Date.now() >= value.startedAt
      && Date.now() - value.startedAt < NATIVE_AUTH_ATTEMPT_TTL_MS) {
      return value;
    }
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage is optional; the current in-memory flow still works.
  }
  return null;
}

export function saveNativeAuthAttempt(attempt: NativeAuthAttempt): void {
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attempt)); } catch {}
}

export function clearNativeAuthAttempt(): void {
  try { window.sessionStorage.removeItem(STORAGE_KEY); } catch {}
}
