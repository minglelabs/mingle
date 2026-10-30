"use client";

import { useCallback, useEffect, useState } from "react";
import InterestLanguageSheet from "@/components/interest-language-sheet";
import { resolveInterestLanguageCopy } from "@/i18n/interest-language-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import type { InterestLanguage } from "@/lib/interest-languages";
import {
  INTEREST_PROMPT_DELAY_MS,
  interestPromptStorageKey,
  parseInterestPromptRecord,
  recordInterestPromptShown,
  shouldShowInterestPrompt,
} from "./interest-language-prompt.logic";

function readRecord(userId: string) {
  try {
    return parseInterestPromptRecord(window.localStorage.getItem(interestPromptStorageKey(userId)));
  } catch {
    return parseInterestPromptRecord(null);
  }
}

/**
 * Asks a signed-in user with no 관심 언어 to pick one, once they have looked
 * at the feed for a moment (see interest-language-prompt.logic.ts).
 */
export default function InterestLanguagePrompt({ viewerId, locale }: { viewerId: string | null; locale: string }) {
  const [primaryLanguages, setPrimaryLanguages] = useState<string[] | null>(null);

  useEffect(() => {
    if (!viewerId || !shouldShowInterestPrompt(readRecord(viewerId), Date.now())) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(buildClientApiPath("/profile"), { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const profile = await response.json() as { primaryLanguages?: unknown; interestLanguages?: unknown };
        const spoken = Array.isArray(profile.primaryLanguages) ? profile.primaryLanguages.filter((code): code is string => typeof code === "string") : [];
        if (Array.isArray(profile.interestLanguages) && profile.interestLanguages.length > 0) return;
        if (document.visibilityState === "hidden") return;
        try {
          window.localStorage.setItem(interestPromptStorageKey(viewerId), JSON.stringify(recordInterestPromptShown(readRecord(viewerId), Date.now())));
        } catch {
          // Not persisted: this user may be asked once more.
        }
        setPrimaryLanguages(spoken);
      } catch {
        // Offline or aborted: ask another time.
      }
    }, INTEREST_PROMPT_DELAY_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [viewerId]);

  const save = useCallback(async (language: InterestLanguage) => {
    try {
      const response = await fetch(buildClientApiPath("/profile"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interestLanguages: [language] }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  if (!primaryLanguages) return null;
  return (
    <InterestLanguageSheet
      locale={locale}
      primaryLanguages={primaryLanguages}
      onSave={save}
      onClose={() => setPrimaryLanguages(null)}
      closeLabel={resolveInterestLanguageCopy(locale).laterAction}
    />
  );
}
