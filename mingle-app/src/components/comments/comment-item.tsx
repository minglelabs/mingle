"use client";

import { useState } from "react";
import { Heart, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { commentsCopy, formatCommentsCopy } from "@/i18n/comments-copy";
import { MAX_COMMENT_LENGTH } from "./comment-state";
import type { CommentNode } from "./comment-types";
import type { WriteOutcome } from "./use-comment-sheet";
import CommentBody from "./comment-body";
import CommentMenu from "./comment-menu";
import OfficialBadge from "@/components/posts/official-badge";

export type CommentItemHandlers = {
  onToggleLike: (id: string) => void;
  onStartReply: (comment: CommentNode) => void;
  /** Resolves "restricted" when the account is restricted: the edit stays open with the draft. */
  onEdit: (id: string, text: string) => Promise<WriteOutcome> | void;
  onDelete: (id: string) => void;
  onReport: (comment: CommentNode) => void;
  onToggleTranslation: (id: string) => void;
  onRetryFailed: (id: string) => void;
  onDiscardFailed: (id: string) => void;
};

type Props = {
  comment: CommentNode;
  isReply: boolean;
  locale: string;
  viewerId: string | null;
  postAuthorId: string;
  viewerLanguage: string | null;
  handlers: CommentItemHandlers;
};

function displayName(author: CommentNode["author"]): string {
  return author.name ?? author.handle;
}

export default function CommentItem({
  comment,
  isReply,
  locale,
  viewerId,
  postAuthorId,
  viewerLanguage,
  handlers,
}: Props) {
  const copy = commentsCopy(locale);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.sourceText ?? "");

  const canTranslate =
    !!viewerLanguage &&
    !comment.isDeleted &&
    comment.translationState !== "same_language";

  // Failed optimistic row: keep the text, offer retry / discard.
  if (comment.failed) {
    return (
      <div
        data-comment-id={comment.id}
        className="flex items-start gap-2 rounded-md bg-destructive/5 px-2 py-1.5"
      >
        <div className="flex-1">
          <p className="whitespace-pre-wrap break-words text-[15px] text-muted-foreground">
            {comment.sourceText}
          </p>
          <p className="mt-0.5 text-[12px] text-destructive">{copy.sendFailed}</p>
        </div>
        <button
          type="button"
          onClick={() => handlers.onRetryFailed(comment.id)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium text-primary"
          aria-label={copy.retry}
        >
          <RotateCcw className="size-3.5" aria-hidden />
          {copy.retry}
        </button>
        <button
          type="button"
          onClick={() => handlers.onDiscardFailed(comment.id)}
          className="rounded-md px-2 py-1 text-[13px] text-muted-foreground"
        >
          {copy.cancel}
        </button>
      </div>
    );
  }

  const name = displayName(comment.author);

  return (
    <div
      data-comment-id={comment.id}
      className={cn("flex gap-2 px-2 py-1.5", comment.pending && "opacity-60")}
    >
      {/* Avatar */}
      <div className="mt-0.5 shrink-0">
        {comment.author.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={comment.author.image}
            alt=""
            className={cn("rounded-full object-cover", isReply ? "size-7" : "size-9")}
          />
        ) : (
          <div
            className={cn(
              "flex items-center justify-center rounded-full bg-muted text-[13px] font-semibold text-muted-foreground",
              isReply ? "size-7" : "size-9",
            )}
            aria-hidden
          >
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[14px] font-semibold text-foreground">{name}</span>
            {comment.author.isOfficial === true && (
              <OfficialBadge locale={locale} tone="dark" className="ml-1 align-[1px]" />
            )}
            {comment.edited && !comment.isDeleted && (
              <span className="ml-1 text-[12px] text-muted-foreground">{copy.edited}</span>
            )}
          </div>
          {!comment.pending && (
            <CommentMenu
              comment={comment}
              locale={locale}
              viewerId={viewerId}
              postAuthorId={postAuthorId}
              onEdit={() => {
                setDraft(comment.sourceText ?? "");
                setEditing(true);
              }}
              onDelete={() => handlers.onDelete(comment.id)}
              onReport={() => handlers.onReport(comment)}
            />
          )}
        </div>

        {/* Deleted placeholder */}
        {comment.isDeleted ? (
          <p className="mt-0.5 text-[14px] italic text-muted-foreground">{copy.deletedPlaceholder}</p>
        ) : editing ? (
          <div className="mt-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={MAX_COMMENT_LENGTH + 100}
              className="w-full resize-none rounded-lg border border-input bg-background px-2 py-1.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label={copy.edit}
            />
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                disabled={draft.trim().length === 0 || draft.length > MAX_COMMENT_LENGTH}
                onClick={() => {
                  const text = draft;
                  setEditing(false);
                  void Promise.resolve(handlers.onEdit(comment.id, text)).then((outcome) => {
                    // A restricted account keeps what it typed: reopen the edit.
                    if (outcome === "restricted") {
                      setDraft(text);
                      setEditing(true);
                    }
                  });
                }}
                className="rounded-md bg-primary px-2.5 py-1 text-[13px] font-medium text-primary-foreground disabled:opacity-40"
              >
                {copy.save}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-md bg-muted px-2.5 py-1 text-[13px] font-medium"
              >
                {copy.cancel}
              </button>
              <span
                className={cn(
                  "ml-auto text-[11px]",
                  draft.length > MAX_COMMENT_LENGTH ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {formatCommentsCopy(copy.charCount, { n: draft.length, max: MAX_COMMENT_LENGTH })}
              </span>
            </div>
          </div>
        ) : (
          <CommentBody
            comment={comment}
            locale={locale}
            canTranslate={canTranslate}
            onToggleTranslation={() => handlers.onToggleTranslation(comment.id)}
            prefix={
              comment.replyToUser ? (
                <span className="mr-1 font-medium text-primary">
                  {formatCommentsCopy(copy.replyToUser, {
                    name: comment.replyToUser.name ?? comment.replyToUser.handle,
                  })}
                </span>
              ) : null
            }
          />
        )}

        {/* Actions row */}
        {!comment.pending && !editing && (
          <div className="mt-1 flex items-center gap-4">
            <button
              type="button"
              onClick={() => handlers.onToggleLike(comment.id)}
              aria-pressed={comment.liked}
              aria-label={formatCommentsCopy(comment.liked ? copy.unlikeWithCount : copy.likeWithCount, {
                n: comment.likeCount,
              })}
              className={cn(
                "flex items-center gap-1 text-[13px]",
                comment.liked ? "text-red-500" : "text-muted-foreground",
              )}
            >
              <Heart className={cn("size-4", comment.liked && "fill-current")} aria-hidden />
              {comment.likeCount > 0 && (
                <span>{formatCommentsCopy(copy.likeCount, { n: comment.likeCount })}</span>
              )}
            </button>

            {!comment.isDeleted && (
              <button
                type="button"
                onClick={() => handlers.onStartReply(comment)}
                className="text-[13px] font-medium text-muted-foreground"
              >
                {copy.reply}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
