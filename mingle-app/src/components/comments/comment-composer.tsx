"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { commentsCopy, formatCommentsCopy } from "@/i18n/comments-copy";
import { MAX_COMMENT_LENGTH, composerEnterAction } from "./comment-state";
import type { ReplyTarget, WriteOutcome } from "./use-comment-sheet";
import AccountBadge from "@/components/posts/account-badge";
import { resolveAccountBadge } from "@/lib/account-badge";

type Props = {
  locale: string;
  sending: boolean;
  disabled: boolean; // signed-out: composer prompts login
  replyTarget: ReplyTarget;
  onCancelReply: () => void;
  /** Resolves "restricted" when the account is restricted: the text is put back. */
  onSubmit: (text: string) => Promise<WriteOutcome> | void;
  onFocusRequiresLogin?: () => void;
};

const MAX_TEXTAREA_PX = 144;
/** Show the live counter only when the limit is getting close. */
const COUNTER_THRESHOLD = Math.floor(MAX_COMMENT_LENGTH * 0.8);

/** A touch keyboard has no Shift key, so Enter must stay a newline there. */
function isTouchInput(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  }
  return typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
}

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

  // Grow with the text like the chat composer: 1 line up to ~6, then scroll.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [value]);

  const trimmedLen = value.trim().length;
  const overLimit = value.length > MAX_COMMENT_LENGTH;
  const canSend = trimmedLen > 0 && !overLimit && !sending && !disabled;

  const handleSubmit = () => {
    if (!canSend) return;
    const text = value;
    setValue("");
    void Promise.resolve(onSubmit(text)).then((outcome) => {
      // No failed row exists for a restricted account, so keep what was typed
      // (unless the viewer already started typing something else).
      if (outcome === "restricted") setValue((current) => (current ? current : text));
    });
  };

  return (
    <div className="border-t border-border/60 bg-background px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-2.5">
      {replyTarget && (
        <div className="mb-2 flex items-center justify-between rounded-xl bg-muted/70 px-3 py-1.5 text-[13px] text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate">
              {formatCommentsCopy(copy.replyingTo, { name: replyTarget.label })}
            </span>
            <AccountBadge kind={resolveAccountBadge(replyTarget.replyToUser)} locale={locale} tone="dark" />
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

      <div
        className={cn(
          "flex items-end gap-2 rounded-[22px] border bg-muted/40 py-1.5 pl-4 pr-1.5 transition-colors",
          "focus-within:border-foreground/30 focus-within:bg-background",
          overLimit ? "border-destructive" : "border-border",
        )}
      >
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
          className="max-h-36 min-h-[32px] flex-1 resize-none self-center bg-transparent py-1 text-[15px] leading-6 placeholder:text-muted-foreground focus:outline-none"
          onKeyDown={(e) => {
            // Hardware keyboard: Enter sends, Shift+Enter is a newline.
            // Touch keyboard: Enter is a newline; the button sends.
            // Enter during IME composition only commits the composition.
            const action = composerEnterAction({
              key: e.key,
              shiftKey: e.shiftKey,
              isComposing: e.nativeEvent.isComposing,
              keyCode: e.nativeEvent.keyCode,
              touchInput: isTouchInput(),
            });
            if (action === "send") {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSend}
          aria-label={sending ? copy.sending : copy.send}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition active:scale-95 disabled:bg-muted-foreground/25 disabled:text-background"
        >
          <ArrowUp className="size-[18px]" strokeWidth={2.5} aria-hidden />
        </button>
      </div>

      {value.length >= COUNTER_THRESHOLD && (
        <div
          className={cn("mt-1 pr-2 text-right text-[11px]", overLimit ? "text-destructive" : "text-muted-foreground")}
          aria-live="polite"
        >
          {formatCommentsCopy(copy.charCount, { n: value.length, max: MAX_COMMENT_LENGTH })}
        </div>
      )}
    </div>
  );
}
