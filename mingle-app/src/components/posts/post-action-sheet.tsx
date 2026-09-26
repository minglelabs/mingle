"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Ban, EyeOff, Flag, Loader2, Pencil, Trash2, X } from "lucide-react";
import type { FeedPostDto } from "@/lib/feed-post-dto";
import { buildClientApiPath } from "@/lib/api-contract";
import { editPostHref } from "@/lib/feed-routes";
import { reportCopy } from "@/i18n/report-copy";
import ReportSheet, { type ReportTarget } from "@/components/reports/report-sheet";

/**
 * The post "⋯" menu.
 * - Own post: edit (editPostHref), archive, delete (confirm, then trash).
 * - Someone else's post: report post, report author, hide post, block author.
 *   Hide and block apply immediately without a confirmation step.
 */
export type PostActionSheetProps = {
  open: boolean;
  post: Pick<FeedPostDto, "id" | "author" | "isMine" | "visibility">;
  locale: string;
  viewerId: string | null;
  onClose: () => void;
  /** The post left this viewer's list: hidden, archived or moved to trash. */
  onPostRemoved: (postId: string, reason: "hidden" | "archived" | "deleted") => void;
  /** The viewer blocked the author: drop every post by this author from the list. */
  onAuthorBlocked: (authorId: string) => void;
  onRequireLogin: () => void;
};

type Pending = null | "archive" | "delete" | "hide" | "block";

export default function PostActionSheet({
  open,
  post,
  locale,
  viewerId,
  onClose,
  onPostRemoved,
  onAuthorBlocked,
  onRequireLogin,
}: PostActionSheetProps) {
  const copy = useMemo(() => reportCopy(locale), [locale]);
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);

  const isSignedIn = Boolean(viewerId);
  const isMine = post.isMine;

  const run = useCallback(
    async (kind: Exclude<Pending, null>, path: `/${string}`, method: "POST" | "DELETE", onDone: () => void) => {
      if (pending) return;
      setPending(kind);
      setError(false);
      try {
        const response = await fetch(buildClientApiPath(path), { method });
        if (!response.ok) throw new Error("action_failed");
        onDone();
      } catch {
        setError(true);
        setPending(null);
      }
    },
    [pending],
  );

  const handleEdit = useCallback(() => {
    onClose();
    router.push(editPostHref(locale, post.id));
  }, [locale, onClose, post.id, router]);

  const handleArchive = useCallback(() => {
    void run("archive", `/posts/${encodeURIComponent(post.id)}/archive`, "POST", () => {
      onPostRemoved(post.id, "archived");
      onClose();
    });
  }, [onClose, onPostRemoved, post.id, run]);

  const handleDelete = useCallback(() => {
    void run("delete", `/posts/${encodeURIComponent(post.id)}`, "DELETE", () => {
      onPostRemoved(post.id, "deleted");
      onClose();
    });
  }, [onClose, onPostRemoved, post.id, run]);

  const handleHide = useCallback(() => {
    void run("hide", `/posts/${encodeURIComponent(post.id)}/hide`, "POST", () => {
      onPostRemoved(post.id, "hidden");
      onClose();
    });
  }, [onClose, onPostRemoved, post.id, run]);

  const handleBlock = useCallback(() => {
    void run("block", `/users/${encodeURIComponent(post.author.id)}/block`, "POST", () => {
      onAuthorBlocked(post.author.id);
      onClose();
    });
  }, [onAuthorBlocked, onClose, post.author.id, run]);

  const requireLoginThen = useCallback(
    (action: () => void) => {
      if (!isSignedIn) {
        onClose();
        onRequireLogin();
        return;
      }
      action();
    },
    [isSignedIn, onClose, onRequireLogin],
  );

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[125] flex items-end justify-center bg-black/40" onClick={onClose}>
        <section
          className="w-full max-w-md rounded-t-[24px] bg-white px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-4 shadow-2xl motion-safe:animate-[slideUp_0.2s_ease-out]"
          role="dialog"
          aria-modal="true"
          aria-label={copy.menuTitle}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-[15px] font-semibold text-slate-500">{copy.menuTitle}</h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition active:bg-gray-100"
              aria-label={copy.cancel}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-col">
            {isMine ? (
              <>
                <ActionRow icon={<Pencil size={19} aria-hidden="true" />} label={copy.edit} onClick={handleEdit} />
                {post.visibility !== "archived" ? (
                  <ActionRow icon={pending === "archive" ? <Loader2 size={19} className="animate-spin" aria-hidden="true" /> : <Archive size={19} aria-hidden="true" />} label={copy.archive} onClick={handleArchive} disabled={pending !== null} />
                ) : null}
                <ActionRow icon={<Trash2 size={19} aria-hidden="true" />} label={copy.delete} tone="danger" onClick={() => setConfirmDelete(true)} disabled={pending !== null} />
              </>
            ) : (
              <>
                <ActionRow icon={<Flag size={19} aria-hidden="true" />} label={copy.reportPost} onClick={() => requireLoginThen(() => setReport({ type: "post", postId: post.id, authorId: post.author.id }))} />
                <ActionRow icon={<Flag size={19} aria-hidden="true" />} label={copy.reportAuthor} onClick={() => requireLoginThen(() => setReport({ type: "user", userId: post.author.id }))} />
                <ActionRow icon={pending === "hide" ? <Loader2 size={19} className="animate-spin" aria-hidden="true" /> : <EyeOff size={19} aria-hidden="true" />} label={copy.hidePost} onClick={() => requireLoginThen(handleHide)} disabled={pending !== null} />
                <ActionRow icon={pending === "block" ? <Loader2 size={19} className="animate-spin" aria-hidden="true" /> : <Ban size={19} aria-hidden="true" />} label={copy.blockAuthor} tone="danger" onClick={() => requireLoginThen(handleBlock)} disabled={pending !== null} />
              </>
            )}
          </div>

          {error ? <p className="mt-2 px-1 text-[13px] text-red-500" role="alert">{copy.actionFailed}</p> : null}
        </section>
      </div>

      {confirmDelete ? (
        <div className="fixed inset-0 z-[135] flex items-center justify-center bg-black/45 px-6" onClick={() => setConfirmDelete(false)}>
          <div
            className="w-full max-w-[20rem] rounded-2xl bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label={copy.deleteConfirmTitle}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[16px] font-bold text-slate-900">{copy.deleteConfirmTitle}</p>
            <p className="mt-2 text-[14px] leading-relaxed text-slate-600">{copy.deleteConfirmBody}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={pending === "delete"}
                className="h-11 rounded-xl border border-gray-200 text-[14px] font-semibold text-gray-700 transition active:bg-gray-50 disabled:opacity-60"
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending === "delete"}
                className="flex h-11 items-center justify-center rounded-xl bg-rose-500 text-[14px] font-semibold text-white transition active:bg-rose-600 disabled:opacity-60"
              >
                {pending === "delete" ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : copy.deleteConfirmAction}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {report ? (
        <ReportSheet open target={report} locale={locale} onClose={() => setReport(null)} />
      ) : null}
    </>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
  tone = "neutral",
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "neutral" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-14 items-center gap-3.5 rounded-xl px-3 text-left text-[15px] font-medium transition active:bg-gray-100 disabled:opacity-50 ${
        tone === "danger" ? "text-rose-600" : "text-slate-900"
      }`}
    >
      <span className={tone === "danger" ? "text-rose-500" : "text-slate-500"}>{icon}</span>
      {label}
    </button>
  );
}
