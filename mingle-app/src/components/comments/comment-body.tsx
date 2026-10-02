"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { commentsCopy } from "@/i18n/comments-copy";
import { resolveCommentBodyView } from "./comment-state";
import type { CommentNode } from "./comment-types";

type Props = {
  comment: CommentNode;
  locale: string;
  /** Toggle the on-demand translation for this comment. */
  onToggleTranslation: () => void;
  /** Whether translation is offered (viewer has a display language, source differs). */
  canTranslate: boolean;
  /** Inline lead-in on the first line of the body (e.g. the reply's "@name"). */
  prefix?: ReactNode;
};

/**
 * Renders a comment body with:
 * - line breaks preserved (whitespace-pre-wrap),
 * - a 3-line clamp measured against the CURRENTLY shown text (source or
 *   translation), expanded via "See more",
 * - a translation toggle (Globe icon + label) mirroring the feed card. A
 *   translation the server already applied is shown first, and "See original"
 *   always shows the source text.
 */
export default function CommentBody({ comment, locale, onToggleTranslation, canTranslate, prefix }: Props) {
  const copy = commentsCopy(locale);
  const view = resolveCommentBodyView(comment);
  const shownText = view.text;

  // "Expanded" belongs to one shown text: switching source <-> translation
  // collapses in the SAME render, so the clamp is already applied when the
  // overflow is measured below.
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const expanded = expandedFor === shownText;
  const [clamped, setClamped] = useState(false);
  const textRef = useRef<HTMLParagraphElement | null>(null);

  // Measure whether the body overflows 3 lines for the currently-shown text.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      const el = textRef.current;
      if (!el) return;
      setClamped(el.scrollHeight - el.clientHeight > 1);
    });
    return () => window.cancelAnimationFrame(id);
  }, [shownText]);

  const translationLabel = copy[view.label];

  return (
    <div className="mt-0.5">
      <p
        ref={textRef}
        className={cn(
          "whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground",
          !expanded && "line-clamp-3",
        )}
      >
        {prefix}
        {shownText}
      </p>

      {clamped && !expanded && (
        <button
          type="button"
          onClick={() => setExpandedFor(shownText)}
          className="mt-0.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
        >
          {copy.seeMore}
        </button>
      )}
      {expanded && clamped && (
        <button
          type="button"
          onClick={() => setExpandedFor(null)}
          className="mt-0.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
        >
          {copy.seeLess}
        </button>
      )}

      {canTranslate && !comment.isDeleted && (
        <button
          type="button"
          onClick={onToggleTranslation}
          disabled={comment.translation?.state === "pending"}
          aria-live="polite"
          className={cn(
            "mt-1 flex items-center gap-1 text-[13px] font-medium",
            view.label === "translationFailed" ? "text-destructive" : "text-primary",
            "disabled:opacity-60",
          )}
        >
          <Globe size={13} strokeWidth={2} aria-hidden="true" />
          {translationLabel}
        </button>
      )}
    </div>
  );
}
