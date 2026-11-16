import { beforeEach, describe, expect, it } from "vitest";
import {
  PENDING_SIGN_IN_METHOD_TTL_MS,
  commitPendingSignInMethod,
  markPendingSignInMethod,
  readLastSignInMethod,
  saveLastSignInMethod,
} from "@/lib/last-sign-in-method";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe("last sign-in method", () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = { localStorage: new MemoryStorage() };
  });

  it("commits a pending Apple / Google choice once signed in", () => {
    markPendingSignInMethod("google", 1_000);
    expect(readLastSignInMethod()).toBeNull();
    expect(commitPendingSignInMethod(2_000)).toBe("google");
    expect(readLastSignInMethod()).toBe("google");
    expect(commitPendingSignInMethod(3_000)).toBeNull();
  });

  it("ignores a stale pending choice", () => {
    saveLastSignInMethod("email");
    markPendingSignInMethod("apple", 1_000);
    expect(commitPendingSignInMethod(1_000 + PENDING_SIGN_IN_METHOD_TTL_MS + 1)).toBeNull();
    expect(readLastSignInMethod()).toBe("email");
  });

  it("an email sign-in replaces an abandoned pending choice", () => {
    markPendingSignInMethod("google", 1_000);
    saveLastSignInMethod("email");
    expect(commitPendingSignInMethod(2_000)).toBeNull();
    expect(readLastSignInMethod()).toBe("email");
  });
});
