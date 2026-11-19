/**
 * A lazy chunk that fails after the page hydrated (the overlays behind
 * next/dynamic) is not caught by the inline script-load recovery, which stops
 * once the page is marked hydrated. On the store app this happens when the
 * WebView stayed open across a deploy: the old chunk names are gone from the
 * server, so opening the screen threw "Application error" for the whole page.
 * Reloading picks up the new build. Reloads are capped so a broken server
 * never loops.
 */

export const CHUNK_RELOAD_STORAGE_KEY = "mingle:chunk-load-reload";
const CHUNK_RELOAD_WINDOW_MS = 120_000;

const CHUNK_ERROR_PATTERNS = [
  /Loading (CSS )?chunk [^ ]+ failed/i,
  /Failed to load chunk/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
];

export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === "ChunkLoadError") return true;
  const text = typeof message === "string" ? message : "";
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

type ReloadDeps = {
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  now?: number;
  reload?: () => void;
};

/** Reloads once per window of time. false = capped (or no storage), nothing done. */
export function reloadAfterChunkLoadError(deps: ReloadDeps = {}): boolean {
  const now = deps.now ?? Date.now();
  try {
    const storage = deps.storage === undefined ? window.sessionStorage : deps.storage;
    if (!storage) return false;
    const last = Number(storage.getItem(CHUNK_RELOAD_STORAGE_KEY) ?? "0");
    if (Number.isFinite(last) && now - last < CHUNK_RELOAD_WINDOW_MS) return false;
    storage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
  } catch {
    return false;
  }
  (deps.reload ?? (() => window.location.reload()))();
  return true;
}
