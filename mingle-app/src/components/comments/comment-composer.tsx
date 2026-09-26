"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { commentsCopy, formatCommentsCopy } from "@/i18n/comments-copy";
import { MAX_COMMENT_LENGTH } from "./comment-state";
import type { ReplyTarget } from "./use-comment-sheet";

type Props = {
  locale: string;
  sending: boolean;
  disabled: boolean; // signed-out: composer prompts login
  replyTarget: ReplyTarget;
  onCancelReply: () => void;
  onSubmit: (text: string) => void;
  onFocusRequiresLogin?: () => void;
};

/**
 * The bottom composer. Enforces the 500-char limit with a live counter,
 * preserves line breaks, prevents duplicate sends (disabled while sending),
 * and shows a "replying to {name}" banner with a cancel affordance.
 */
export default function CommentComposer({
  locale,
  sending,
  disabled,
  replyTarget,
  onCancelReply,
  onSubmit,
  onFocusRequiresLogin,
}: Props) {
  const copy = commentsCopy(locale);
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Focus the input when a reply target appears.
  useEffect(() => {
    if (replyTarget && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyTarget]);

  const trimmedLen = value.trim().length;
  const overLimit = value.length > MAX_COMMENT_LENGTH;
  const canSend = trimmedLen > 0 && !overLimit && !sending && !disabled;

  const handleSubmit = () => {
    if (!canSend) return;
    onSubmit(value);
    setValue("");
  };

  return (
    <div className="border-t border-border bg-background px-3 pb-[env(safe-area-inset-bottom)] pt-2">
      {replyTarget && (
        <div className="mb-1 flex items-center justify-between rounded-md bg-muted px-2 py-1 text-[13px] text-muted-foreground">
          <span className="truncate">
            {formatCommentsCopy(copy.replyingTo, { name: replyTarget.label })}
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label={copy.cancelReply}
            className="ml-2 rounded-full p-1 hover:bg-background"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => {
              if (disabled) onFocusRequiresLogin?.();
            }}
            readOnly={disabled}
            rows={1}
            placeholder={replyTarget ? copy.writeReply : copy.writeComment}
            aria-label={replyTarget ? copy.writeReply : copy.writeComment}
            className={cn(
              "max-h-32 min-h-[40px] w-full resize-none rounded-2xl border border-input bg-background px-3 py-2 text-[15px] leading-relaxed",
              "focus:outline-none focus:ring-2 focus:ring-ring",
            )}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter inserts a newline (line breaks preserved).
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <div
            className={cn(
              "mt-0.5 text-right text-[11px]",
              overLimit ? "text-destructive" : "text-muted-foreground",
            )}
            aria-live="polite"
          >
            {formatCommentsCopy(copy.charCount, { n: value.length, max: MAX_COMMENT_LENGTH })}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSend}
          className={cn(
            "mb-6 shrink-0 rounded-full px-4 py-2 text-[14px] font-semibold",
            "bg-primary text-primary-foreground disabled:opacity-40",
          )}
        >
          {sending ? copy.sending : copy.send}
        </button>
      </div>
    </div>
  );
}
