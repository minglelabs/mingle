"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { buildClientApiPath } from "@/lib/api-contract";

/** Shown only for a name with letters outside the Latin alphabet (same rule as the server). */
export function nameNeedsPronunciation(name: string | null | undefined): boolean {
  const value = (name ?? "").trim();
  return value.length > 0 && /[^\u0000-\u024F\u1E00-\u1EFF\s\p{P}\p{S}\p{N}]/u.test(value);
}

/**
 * "Abc" next to a name (owner, 2026-11-25): tap it to read the name the way it
 * sounds, in English letters ("Min-ji Kim"). Names are not translated.
 */
export default function NamePronunciationButton({ userId, name, label }: { userId: string; name: string; label: string }) {
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  const [pronunciation, setPronunciation] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (state === "busy") return;
    if (pronunciation) {
      setPronunciation(null);
      return;
    }
    setState("busy");
    try {
      const response = await fetch(buildClientApiPath(`/users/${encodeURIComponent(userId)}/name-pronunciation`));
      const data = response.ok ? await response.json() as { pronunciation?: unknown } : null;
      if (typeof data?.pronunciation === "string" && data.pronunciation) {
        setPronunciation(data.pronunciation);
        setState("idle");
      } else {
        setState("failed");
      }
    } catch {
      setState("failed");
    }
  }, [pronunciation, state, userId]);

  if (!nameNeedsPronunciation(name)) return null;
  return (
    <>
      <button
        type="button"
        data-qa="profile-name-pronunciation"
        onClick={() => void load()}
        aria-label={label}
        aria-pressed={pronunciation !== null}
        className={`inline-flex h-6 shrink-0 items-center justify-center rounded-full px-2 text-[11px] font-bold tracking-tight transition active:scale-95 ${pronunciation ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-slate-600"}`}
      >
        {state === "busy" ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : "Abc"}
      </button>
      {pronunciation ? (
        <span data-qa="profile-name-pronunciation-text" className="min-w-0 truncate text-[13px] font-medium text-slate-500">
          {pronunciation}
        </span>
      ) : null}
    </>
  );
}
