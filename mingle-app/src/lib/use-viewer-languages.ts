"use client";

import { useEffect, useState } from "react";
import { buildClientApiPath } from "@/lib/api-contract";

/** The signed-in reader's own language and 관심 언어, for the language flags on posts and bios. */
export type ViewerLanguages = { comfortable: string | null; interest: string[] };

const EMPTY: ViewerLanguages = { comfortable: null, interest: [] };
// One read per account for the whole visit: every post card asks for the same thing.
const cache = new Map<string, Promise<ViewerLanguages>>();
const resolved = new Map<string, ViewerLanguages>();

function load(userId: string): Promise<ViewerLanguages> {
  let pending = cache.get(userId);
  if (!pending) {
    pending = fetch(buildClientApiPath("/profile"), { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("profile_unavailable");
        const data = await response.json() as { primaryLanguages?: unknown; interestLanguages?: unknown };
        const primary = Array.isArray(data.primaryLanguages) ? data.primaryLanguages.filter((code): code is string => typeof code === "string") : [];
        const interest = Array.isArray(data.interestLanguages)
          ? data.interestLanguages
            .map((entry) => (typeof entry === "string" ? entry : (entry as { code?: unknown } | null)?.code))
            .filter((code): code is string => typeof code === "string" && code.length > 0)
          : [];
        const languages = { comfortable: primary[0] ?? null, interest };
        resolved.set(userId, languages);
        return languages;
      })
      .catch(() => {
        // Asked again by the next card.
        cache.delete(userId);
        return EMPTY;
      });
    cache.set(userId, pending);
  }
  return pending;
}

/** `viewerId`: the signed-in account, or null (signed out: no languages). */
export function useViewerLanguages(viewerId: string | null | undefined): ViewerLanguages {
  const userId = viewerId ?? "";
  const [languages, setLanguages] = useState<ViewerLanguages>(() => (userId ? resolved.get(userId) ?? EMPTY : EMPTY));
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void load(userId).then((next) => {
      if (!cancelled) setLanguages(next);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return userId ? languages : EMPTY;
}
