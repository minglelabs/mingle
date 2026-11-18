import { describe, expect, it, vi } from "vitest";
import { CHUNK_RELOAD_STORAGE_KEY, isChunkLoadError, reloadAfterChunkLoadError } from "./chunk-load-recovery";

function memory(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

describe("chunk-load-recovery", () => {
  it("recognises webpack, turbopack and native dynamic-import failures", () => {
    const webpack = Object.assign(new Error("Loading chunk 4821 failed.\n(error: https://x/_next/static/chunks/4821.js)"), { name: "ChunkLoadError" });
    expect(isChunkLoadError(webpack)).toBe(true);
    expect(isChunkLoadError(new Error("Failed to load chunk /_next/static/chunks/abc.js from module 123"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/a.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError("Loading chunk 1 failed")).toBe(false);
  });

  it("reloads once per two minutes", () => {
    const storage = memory();
    const reload = vi.fn();
    expect(reloadAfterChunkLoadError({ storage, now: 1_000_000, reload })).toBe(true);
    expect(storage.getItem(CHUNK_RELOAD_STORAGE_KEY)).toBe("1000000");
    expect(reloadAfterChunkLoadError({ storage, now: 1_060_000, reload })).toBe(false);
    expect(reloadAfterChunkLoadError({ storage, now: 1_130_000, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does nothing without storage, so a broken server cannot loop", () => {
    const reload = vi.fn();
    expect(reloadAfterChunkLoadError({ storage: null, reload })).toBe(false);
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => {} };
    expect(reloadAfterChunkLoadError({ storage: throwing, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
