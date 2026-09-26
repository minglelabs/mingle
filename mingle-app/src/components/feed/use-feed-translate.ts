"use client";

import { buildClientApiPath } from "@/lib/api-contract";
import type { FeedPostDto } from "@/lib/feed-post-dto";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type TranslateButtonMode =
  | "hidden" // same_language — nothing to translate
  | "show" // "See translation"
  | "loading" // "Translating…"
  | "showOriginal" // translation visible → "Show original"
  | "retry"; // last attempt failed → tap to try again

type UseFeedTranslateOptions = {
  post: Pick<FeedPostDto, "id" | "displayLanguage" | "displayText" | "translationState">;
  /** The viewer's default display language, used when the DTO has none. */
  viewerLanguage: string;
  isSignedIn: boolean;
  onRequireLogin: () => void;
};

type UseFeedTranslateReturn = {
  mode: TranslateButtonMode;
  /** Whether the translation (rather than the original) should be displayed. */
  showingTranslation: boolean;
  /** The translated body once available (from the DTO or a fresh request). */
  translatedText: string | null;
  /** True while the last manual attempt has failed and not yet retried. */
  failed: boolean;
  toggle: () => void;
};

/**
 * Drives the per-post translate button, wired to `POST /posts/{id}/translate`.
 *
 * The DTO's `translationState` seeds the initial mode:
 * - `same_language` → button hidden.
 * - `ready` → `displayText` is the translation; the button toggles view.
 * - `pending` → the reader sees the original and can read while waiting.
 * - `failed` / `none` → the original with "See translation" (no auto-retry).
 *
 * The original is always readable; a failure never hides the post.
 */
export function useFeedTranslate(options: UseFeedTranslateOptions): UseFeedTranslateReturn {
  const { post, viewerLanguage, isSignedIn, onRequireLogin } = options;

  const seededTranslation = post.translationState === "ready" ? post.displayText : null;

  const [translatedText, setTranslatedText] = useState<string | null>(seededTranslation);
  const [showingTranslation, setShowingTranslation] = useState<boolean>(
    post.translationState === "ready",
  );
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(post.translationState === "failed");
  const inFlightRef = useRef(false);

  // Re-seed when the post identity changes (list replaced / navigated).
  useEffect(() => {
    const seeded = post.translationState === "ready" ? post.displayText : null;
    setTranslatedText(seeded);
    setShowingTranslation(post.translationState === "ready");
    setFailed(post.translationState === "failed");
    setLoading(false);
    inFlightRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  const language = useMemo(
    () => (post.displayLanguage && post.displayLanguage.trim()) || viewerLanguage,
    [post.displayLanguage, viewerLanguage],
  );

  const requestTranslation = useCallback(async () => {
    if (inFlightRef.current) return;
    if (!isSignedIn) {
      onRequireLogin();
      return;
    }
    inFlightRef.current = true;
    setLoading(true);
    setFailed(false);

    try {
      const res = await fetch(buildClientApiPath(`/posts/${encodeURIComponent(post.id)}/translate`), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const body = (await res.json().catch(() => null)) as
        | { text?: string | null; status?: string }
        | null;
      if (body && body.status === "ready" && typeof body.text === "string" && body.text.length > 0) {
        setTranslatedText(body.text);
        setShowingTranslation(true);
        setFailed(false);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [post.id, language, isSignedIn, onRequireLogin]);

  const toggle = useCallback(() => {
    if (loading) return;
    if (translatedText) {
      // Already have a translation — flip between original and translated.
      setShowingTranslation((prev) => !prev);
      return;
    }
    void requestTranslation();
  }, [loading, translatedText, requestTranslation]);

  const mode: TranslateButtonMode = (() => {
    if (post.translationState === "same_language") return "hidden";
    if (loading) return "loading";
    if (translatedText) return showingTranslation ? "showOriginal" : "show";
    if (failed) return "retry";
    return "show";
  })();

  return { mode, showingTranslation: Boolean(showingTranslation && translatedText), translatedText, failed, toggle };
}
