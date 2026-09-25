"use client";

import { useCallback, useState } from "react";

export type TranslatePhase = "idle" | "loading" | "done" | "error";

type UseFeedTranslateReturn = {
  phase: TranslatePhase;
  translatedText: string | null;
  showingTranslation: boolean;
  /** Trigger translation (first call fetches, subsequent toggles). */
  toggle: () => void;
};

/**
 * Manages the translation lifecycle for a single post.
 * Mock implementation — returns a dummy translated string after a delay.
 */
export function useFeedTranslate(
  postId: string,
  _sourceLanguage: string,
): UseFeedTranslateReturn {
  const [phase, setPhase] = useState<TranslatePhase>("idle");
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [showingTranslation, setShowingTranslation] = useState(false);

  const toggle = useCallback(() => {
    if (phase === "done" && translatedText) {
      // Toggle between original and translated
      setShowingTranslation((prev) => !prev);
      return;
    }

    if (phase === "loading") return;

    // Fetch translation
    setPhase("loading");
    // TODO: POST /api/posts/{postId}/translate
    const timer = setTimeout(() => {
      // Mock: pretend we got a translation
      setTranslatedText(`[Translated] (mock translation for ${postId})`);
      setPhase("done");
      setShowingTranslation(true);
    }, 800);

    return () => clearTimeout(timer);
  }, [phase, translatedText, postId]);

  return { phase, translatedText, showingTranslation, toggle };
}
