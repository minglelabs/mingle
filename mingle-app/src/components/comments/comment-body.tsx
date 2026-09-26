"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { commentsCopy } from "@/i18n/comments-copy";
import type { CommentNode } from "./comment-types";

type Props = {
  comment: CommentNode;
  locale: string;
  /** Toggle the on-demand translation for this comment. */
  onToggleTranslation: () => void;
  /** Whether translation is offered (viewer has a display language, source differs). */
  canTranslate: boolean;
};

/**
 * Renders a comment body with:
 * - line breaks preserved (whitespace-pre-wrap),
 * - a 3-line clamp measured against the CURRENTLY shown text (source or
 *   translation), expanded via "See more",
 * - a translation toggle line mirroring the post policy.
 */
export default function CommentBody({ comment, locale, onToggleTranslation, canTranslate }: Props) {
  const copy = commentsCopy(locale);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const textRef = useRef<HTMLParagraphElement | null>(null);

  const overlay = comment.translation;
  const showingTranslation = overlay?.state === "ready" && overlay.showing;
  const shownText = showingTranslation ? overlay?.text ?? "" : comment.displayText ?? comment.sourceText ?? "";

  // Measure whether the body overflows 3 lines for the currently-shown text.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      setExpanded(false);
      const el = textRef.current;
      if (!el) return;
      const isOverflowing = el.scrollHeight - el.clientHeight > 1;
      setClamped(isOverflowing);
    });
    return () => window.cancelAnimationFrame(id);
  }, [shownText]);

  const translationLabel = (() => {
    const state = overlay?.state;
    if (state === "pending") return copy.translating;
    if (state === "failed") return copy.translationFailed;
    if (state === "ready" && overlay?.showing) return copy.seeOriginal;
    return copy.seeTranslation;
  })();

  return (
    <div className="mt-0.5">
      <p
        ref={textRef}
        className={cn(
          "whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground",
          !expanded && "line-clamp-3",
        )}
      >
        {shownText}
      </p>

      {clamped && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-0.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
        >
          {copy.seeMore}
        </button>
      )}
      {expanded && clamped && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-0.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
        >
          {copy.seeLess}
        </button>
      )}

      {canTranslate && !comment.isDeleted && (
        <button
          type="button"
          onClick={onToggleTranslation}
          disabled={overlay?.state === "pending"}
          aria-live="polite"
          className={cn(
            "mt-1 block text-[13px] font-medium",
            overlay?.state === "failed" ? "text-destructive" : "text-primary",
            "disabled:opacity-60",
          )}
        >
          {translationLabel}
        </button>
      )}
    </div>
  );
}
