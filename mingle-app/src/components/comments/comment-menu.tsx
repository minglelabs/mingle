"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { commentsCopy } from "@/i18n/comments-copy";
import type { CommentNode } from "./comment-types";
import { canDelete, canEdit, canReport } from "./comment-state";

type Props = {
  comment: CommentNode;
  locale: string;
  viewerId: string | null;
  postAuthorId: string;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
};

/**
 * The comment ⋯ menu.
 * - own comment: Edit, Delete
 * - other's comment: Report, plus Delete when the viewer owns the post
 */
export default function CommentMenu({
  comment,
  locale,
  viewerId,
  postAuthorId,
  onEdit,
  onDelete,
  onReport,
}: Props) {
  const copy = commentsCopy(locale);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const editable = canEdit(comment, viewerId);
  const deletable = canDelete(comment, viewerId, postAuthorId);
  const reportable = canReport(comment, viewerId);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Nothing to offer (e.g. signed-out, or own deleted comment).
  if (!editable && !deletable && !reportable) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={copy.more}
        className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 min-w-32 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-lg"
        >
          {editable && (
            <MenuItem
              label={copy.edit}
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
            />
          )}
          {reportable && (
            <MenuItem
              label={copy.report}
              onClick={() => {
                setOpen(false);
                onReport();
              }}
            />
          )}
          {deletable && !confirming && (
            <MenuItem destructive label={copy.delete} onClick={() => setConfirming(true)} />
          )}
          {deletable && confirming && (
            <div className="px-3 py-2">
              <p className="mb-1.5 text-[13px] text-muted-foreground">{copy.deleteConfirm}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setConfirming(false);
                    onDelete();
                  }}
                  className="rounded-md bg-destructive px-2.5 py-1 text-[13px] font-medium text-destructive-foreground"
                >
                  {copy.deleteConfirmYes}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-md bg-muted px-2.5 py-1 text-[13px] font-medium"
                >
                  {copy.cancel}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  destructive,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "block w-full px-3 py-2 text-left text-[14px] hover:bg-muted",
        destructive ? "text-destructive" : "text-foreground",
      )}
    >
      {label}
    </button>
  );
}
