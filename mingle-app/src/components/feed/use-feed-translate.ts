"use client";

import { buildClientApiPath } from "@/lib/api-contract";
import type { FeedPostDto, FeedPostTranslationState } from "@/lib/feed-post-dto";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

export type TranslateButtonMode =
  | "hidden" // same_language, or no body to translate (image-only post)
  | "show" // "See translation"
  | "loading" // "Translating…"
  | "showOriginal" // translation visible → "Show original"
  | "retry"; // last attempt failed → tap to try again

type TranslatePost = Pick<FeedPostDto, "id" | "sourceText" | "displayLanguage" | "displayText" | "translationState">;

type UseFeedTranslateOptions = {
  post: TranslatePost;
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
  /** True while the last attempt (seeded or manual) has failed and not yet retried. */
  failed: boolean;
  /**
   * Increments ONLY when a request the viewer made fails. A `failed` state
   * seeded from the DTO never bumps it, so loading the feed shows no toast.
   */
  requestFailureCount: number;
  toggle: () => void;
};

// ── Pure state machine (unit-tested) ─────────────────────────────────────

export type TranslateState = {
  translatedText: string | null;
  showingTranslation: boolean;
  loading: boolean;
  failed: boolean;
  requestFailureCount: number;
};

export type TranslateAction =
  | { type: "seed"; post: Pick<FeedPostDto, "displayText" | "translationState"> }
  | { type: "request" }
  | { type: "success"; text: string }
  | { type: "failure" }
  | { type: "flip" };

export function seedTranslateState(
  post: Pick<FeedPostDto, "displayText" | "translationState">,
): TranslateState {
  const ready = post.translationState === "ready" && Boolean(post.displayText);
  return {
    translatedText: ready ? post.displayText : null,
    showingTranslation: ready,
    loading: false,
    failed: post.translationState === "failed",
    requestFailureCount: 0,
  };
}

export function translateReducer(state: TranslateState, action: TranslateAction): TranslateState {
  switch (action.type) {
    case "seed":
      return seedTranslateState(action.post);
    case "request":
      return { ...state, loading: true, failed: false };
    case "success":
      return { ...state, loading: false, failed: false, translatedText: action.text, showingTranslation: true };
    case "failure":
      return { ...state, loading: false, failed: true, requestFailureCount: state.requestFailureCount + 1 };
    case "flip":
      return state.translatedText ? { ...state, showingTranslation: !state.showingTranslation } : state;
    default:
      return state;
  }
}

/** Whether a post has any body the translate endpoint could translate. */
export function hasTranslatableBody(sourceText: string | null | undefined): boolean {
  return typeof sourceText === "string" && sourceText.trim().length > 0;
}

export function resolveTranslateMode(
  translationState: FeedPostTranslationState,
  sourceText: string | null | undefined,
  state: Pick<TranslateState, "loading" | "translatedText" | "showingTranslation" | "failed">,
): TranslateButtonMode {
  if (translationState === "same_language") return "hidden";
  if (!hasTranslatableBody(sourceText)) return "hidden";
  if (state.loading) return "loading";
  if (state.translatedText) return state.showingTranslation ? "showOriginal" : "show";
  if (state.failed) return "retry";
  return "show";
}

/**
 * The ONE body string a card shows, used for the centre preview, the collapsed
 * image-post snippet and the expanded body alike, so the three can never show
 * different languages. The translation wins only while it is being shown and
 * actually exists (seeded from the DTO or fetched on request).
 */
export function resolveShownText(
  sourceText: string,
  translatedText: string | null,
  showingTranslation: boolean,
): string {
  if (showingTranslation && typeof translatedText === "string" && translatedText.length > 0) {
    return translatedText;
  }
  return sourceText;
}

/** Toast only when the manual-failure counter advanced (never on seed). */
export function shouldToastTranslateFailure(previousCount: number, nextCount: number): boolean {
  return nextCount > previousCount;
}

/**
 * Drives the per-post translate button, wired to `POST /posts/{id}/translate`.
 *
 * The DTO's `translationState` seeds the initial mode:
 * - `same_language` → button hidden (also hidden for an image-only post).
 * - `ready` → `displayText` is the translation; the button toggles view.
 * - `pending` → the reader sees the original and can read while waiting.
 * - `failed` / `none` → the original with "See translation" (no auto-retry).
 *
 * The original is always readable; a failure never hides the post.
 */
export function useFeedTranslate(options: UseFeedTranslateOptions): UseFeedTranslateReturn {
  const { post, viewerLanguage, isSignedIn, onRequireLogin } = options;

  const [state, dispatch] = useReducer(translateReducer, post, seedTranslateState);
  const inFlightRef = useRef(false);

  // Re-seed when the post identity changes (list replaced / navigated).
  const seededIdRef = useRef(post.id);
  useEffect(() => {
    if (seededIdRef.current === post.id) return;
    seededIdRef.current = post.id;
    inFlightRef.current = false;
    dispatch({ type: "seed", post });
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
    dispatch({ type: "request" });

    try {
      const res = await fetch(buildClientApiPath(`/posts/${encodeURIComponent(post.id)}/translate`), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      if (!res.ok) {
        dispatch({ type: "failure" });
        return;
      }
      const body = (await res.json().catch(() => null)) as
        | { text?: string | null; status?: string }
        | null;
      if (body && body.status === "ready" && typeof body.text === "string" && body.text.length > 0) {
        dispatch({ type: "success", text: body.text });
      } else {
        dispatch({ type: "failure" });
      }
    } catch {
      dispatch({ type: "failure" });
    } finally {
      inFlightRef.current = false;
    }
  }, [post.id, language, isSignedIn, onRequireLogin]);

  const toggle = useCallback(() => {
    if (state.loading) return;
    if (!hasTranslatableBody(post.sourceText)) return;
    if (state.translatedText) {
      // Already have a translation — flip between original and translated.
      dispatch({ type: "flip" });
      return;
    }
    void requestTranslation();
  }, [state.loading, state.translatedText, post.sourceText, requestTranslation]);

  const mode = resolveTranslateMode(post.translationState, post.sourceText, state);

  return {
    mode,
    showingTranslation: Boolean(state.showingTranslation && state.translatedText),
    translatedText: state.translatedText,
    failed: state.failed,
    requestFailureCount: state.requestFailureCount,
    toggle,
  };
}
