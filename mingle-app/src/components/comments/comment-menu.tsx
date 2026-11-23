"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
        className="rounded-full p-1.5 text-muted-foreground hover:bg-gray-100"
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 min-w-32 overflow-hidden rounded-lg border border-gray-100 bg-white py-1 shadow-lg"
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
          {deletable && (
            <MenuItem
              destructive
              label={copy.delete}
              onClick={() => {
                setOpen(false);
                setConfirming(true);
              }}
            />
          )}
        </div>
      )}

      {confirming &&
        createPortal(
          <div
            className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 px-6"
            // The portal still bubbles React events up the comment sheet
            // (drag handle, swipe); keep them inside the modal.
            onPointerDown={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(false);
            }}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-label={copy.deleteConfirm}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[18rem] rounded-2xl bg-white p-5 text-center shadow-xl"
            >
              <p className="text-[15px] font-semibold text-gray-900">{copy.deleteConfirm}</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="h-10 rounded-xl bg-gray-100 text-[14px] font-medium text-gray-700"
                >
                  {copy.cancel}
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => {
                    setConfirming(false);
                    onDelete();
                  }}
                  className="h-10 rounded-xl bg-destructive text-[14px] font-semibold text-destructive-foreground"
                >
                  {copy.deleteConfirmYes}
                </button>
              </div>
            </div>
          </div>,
          document.body,
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
        "block w-full px-3 py-2 text-left text-[14px] hover:bg-gray-100",
        destructive ? "text-destructive" : "text-foreground",
      )}
    >
      {label}
    </button>
  );
}
