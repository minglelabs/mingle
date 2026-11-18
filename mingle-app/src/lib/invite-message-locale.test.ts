import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INVITE_MESSAGE_LOCALE_STORAGE_KEY,
  readStoredInviteMessageLocale,
  resolveInviteMessageLocale,
  storeInviteMessageLocale,
} from "./invite-message-locale";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

describe("invite-message-locale", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the UI default until the user picks, then remembers the pick", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(resolveInviteMessageLocale("ko")).toBe("en");
    expect(resolveInviteMessageLocale("ja")).toBe("ja");
    storeInviteMessageLocale("vi");
    expect(readStoredInviteMessageLocale()).toBe("vi");
    expect(resolveInviteMessageLocale("ko")).toBe("vi");
  });

  it("ignores a stored value that is not a supported language", () => {
    const storage = memoryStorage();
    storage.setItem(INVITE_MESSAGE_LOCALE_STORAGE_KEY, "xx");
    vi.stubGlobal("localStorage", storage);
    expect(resolveInviteMessageLocale("ko")).toBe("en");
  });

  it("falls back to the default when storage throws or is missing", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    });
    expect(() => storeInviteMessageLocale("fr")).not.toThrow();
    expect(resolveInviteMessageLocale("ko")).toBe("en");
    vi.stubGlobal("localStorage", undefined);
    expect(resolveInviteMessageLocale("de")).toBe("de");
  });
});
