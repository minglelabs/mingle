"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
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
  /** Keyboard is up: drop the home-indicator padding so the bar sits on the keyboard. */
  keyboardOpen?: boolean;
};

// Same metrics as the chat room's keyboard-mode composer (LivePhoneDemo).
const TEXTAREA_MIN_HEIGHT_PX = 36;
const TEXTAREA_MAX_HEIGHT_PX = 104;
const TEXTAREA_LINE_HEIGHT_PX = 22;
const SHELL_MIN_HEIGHT_PX = 37;
const CONTROL_SIZE_PX = 36;
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
  keyboardOpen = false,
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

  // Grow with the text like the chat composer: 1 line up to ~4, then scroll.
  const [textareaHeight, setTextareaHeight] = useState(TEXTAREA_MIN_HEIGHT_PX);
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.lineHeight = `${TEXTAREA_LINE_HEIGHT_PX}px`;
    el.style.overflowY = "hidden";
    const next = Math.max(TEXTAREA_MIN_HEIGHT_PX, Math.min(TEXTAREA_MAX_HEIGHT_PX, el.scrollHeight));
    el.style.height = `${next}px`;
    el.style.overflowY = next >= TEXTAREA_MAX_HEIGHT_PX ? "auto" : "hidden";
    setTextareaHeight(next);
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
    <div
      className={cn(
        "border-t border-gray-100 bg-white px-3 pt-2.5",
        keyboardOpen ? "pb-2.5" : "pb-[max(env(safe-area-inset-bottom),10px)]",
      )}
    >
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

      <div className="flex items-end gap-1.5">
        <div
          className={cn(
            "flex min-w-0 flex-1 items-end overflow-visible rounded-[0.95rem] border bg-white px-1",
            overLimit ? "border-red-400" : "border-gray-200",
          )}
          style={{ height: `${Math.max(SHELL_MIN_HEIGHT_PX, textareaHeight)}px` }}
        >
          <div className="flex min-w-0 flex-1 items-end px-1">
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
              className="box-border block min-h-0 flex-1 resize-none self-end bg-transparent px-0.5 py-[7px] text-[16px] leading-[22px] text-gray-900 outline-none placeholder:text-gray-400"
              style={{ height: `${textareaHeight}px` }}
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
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSend}
          onPointerDown={(e) => {
            // Do not let the send button steal focus from the textarea.
            e.preventDefault();
          }}
          aria-label={sending ? copy.sending : copy.send}
          className={cn(
            "inline-flex shrink-0 items-center justify-center self-end rounded-full transition-all duration-200 active:scale-95",
            canSend ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white" : "bg-transparent text-gray-300",
          )}
          style={{ width: `${CONTROL_SIZE_PX}px`, height: `${CONTROL_SIZE_PX}px` }}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 18.5V6.5" />
            <path d="M7.75 10.75L12 6.5l4.25 4.25" />
          </svg>
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
