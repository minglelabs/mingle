import { afterEach, describe, expect, it, vi } from "vitest";
import { clearNativeAuthAttempt, readNativeAuthAttempt, saveNativeAuthAttempt, NATIVE_AUTH_ATTEMPT_TTL_MS } from "./native-auth-attempt";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function storage() {
  const values = new Map<string, string>();
  vi.stubGlobal("window", { sessionStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  return values;
}

describe("native OAuth attempt recovery", () => {
  it("recovers the same request after a remount without storing credentials", () => {
    const values = storage();
    const attempt = { requestId: "rq_1234567890123456", provider: "google" as const, startedAt: Date.now() };
    saveNativeAuthAttempt(attempt);
    expect(readNativeAuthAttempt()).toEqual(attempt);
    expect(readNativeAuthAttempt()).toEqual(attempt);
    expect(JSON.parse([...values.values()][0])).toEqual(attempt);
    clearNativeAuthAttempt();
    expect(readNativeAuthAttempt()).toBeNull();
  });

  it("expires abandoned requests at the native browser timeout so retry remains possible", () => {
    storage(); vi.useFakeTimers();
    saveNativeAuthAttempt({ requestId: "rq_1234567890123456", provider: "apple", startedAt: Date.now() });
    vi.advanceTimersByTime(NATIVE_AUTH_ATTEMPT_TTL_MS);
    expect(readNativeAuthAttempt()).toBeNull();
  });

  it.each(["not json", '{}', '{"requestId":12}', JSON.stringify({requestId:"rq_1234567890123456",provider:"email",startedAt:Date.now()})])("rejects malformed saved attempts: %s", (raw) => {
    const values = storage(); values.set("mingle:native-auth-attempt:v1", raw);
    expect(readNativeAuthAttempt()).toBeNull();
  });

  it("works without session storage access", () => {
    vi.stubGlobal("window", { get sessionStorage() { throw new Error("blocked"); } });
    expect(() => saveNativeAuthAttempt({requestId:"rq_1234567890123456",provider:"google",startedAt:Date.now()})).not.toThrow();
    expect(readNativeAuthAttempt()).toBeNull();
    expect(clearNativeAuthAttempt).not.toThrow();
  });
});
