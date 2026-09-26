"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { buildClientApiPath } from "@/lib/api-contract";
import { reportCopy } from "@/i18n/report-copy";
import { REPORT_REASONS, MAX_REPORT_MESSAGE_LENGTH, type ReportReason } from "@/server/reports/report-service";

/**
 * One report flow for posts, comments and people: a fixed reason list
 * (including "other"), an optional free-text note of at most 500 characters,
 * and a receipt message. A repeat report of the same target only shows
 * "already reported". Reporting never hides or blocks anything by itself.
 */
export type ReportTarget =
  | { type: "post"; postId: string; authorId: string }
  | { type: "comment"; commentId: string; authorId: string }
  | { type: "user"; userId: string };

export type ReportSheetProps = {
  open: boolean;
  target: ReportTarget;
  locale: string;
  onClose: () => void;
};

type Phase = "form" | "submitting" | "submitted" | "already" | "error";

function endpointFor(target: ReportTarget): `/${string}` {
  switch (target.type) {
    case "post":
      return `/posts/${encodeURIComponent(target.postId)}/report`;
    case "comment":
      return `/comments/${encodeURIComponent(target.commentId)}/report`;
    case "user":
      return `/users/${encodeURIComponent(target.userId)}/report`;
  }
}

export default function ReportSheet({ open, target, locale, onClose }: ReportSheetProps) {
  const copy = useMemo(() => reportCopy(locale), [locale]);
  const [reason, setReason] = useState<ReportReason>("spam");
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Reset to a clean form whenever the sheet re-opens or the target changes.
  useEffect(() => {
    if (open) {
      setReason("spam");
      setNote("");
      setPhase("form");
    }
  }, [open, target]);

  // Auto-dismiss shortly after a successful receipt / already-reported notice.
  useEffect(() => {
    if (phase !== "submitted" && phase !== "already") return;
    const timer = window.setTimeout(onClose, 1400);
    return () => window.clearTimeout(timer);
  }, [phase, onClose]);

  const title = useMemo(() => {
    switch (target.type) {
      case "post": return copy.reportTitlePost;
      case "comment": return copy.reportTitleComment;
      case "user": return copy.reportTitleUser;
    }
  }, [copy, target.type]);

  const handleSubmit = useCallback(async () => {
    if (phase === "submitting") return;
    setPhase("submitting");
    try {
      const response = await fetch(buildClientApiPath(endpointFor(target)), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, message: note.trim() || undefined }),
      });
      if (!response.ok) throw new Error("report_failed");
      const data = (await response.json().catch(() => ({}))) as { duplicate?: boolean; status?: string };
      setPhase(data.duplicate || data.status === "already_reported" ? "already" : "submitted");
    } catch {
      setPhase("error");
    }
  }, [note, phase, reason, target]);

  if (!open) return null;

  const noteRemaining = MAX_REPORT_MESSAGE_LENGTH - note.length;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <section
        ref={dialogRef}
        className="w-full max-w-md rounded-t-[24px] bg-white px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-5 shadow-2xl motion-safe:animate-[slideUp_0.2s_ease-out]"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[18px] font-bold text-slate-900">
            <AlertTriangle size={19} className="text-rose-500" aria-hidden="true" />
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition active:bg-gray-100"
            aria-label={copy.cancel}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {phase === "submitted" ? (
          <p className="flex items-center gap-2 py-6 text-[15px] font-medium text-emerald-600" role="status">
            <Check size={18} aria-hidden="true" /> {copy.submitted}
          </p>
        ) : phase === "already" ? (
          <p className="flex items-center gap-2 py-6 text-[15px] font-medium text-slate-600" role="status">
            <Check size={18} aria-hidden="true" /> {copy.alreadyReported}
          </p>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
          >
            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 block text-[13px] font-semibold text-gray-600">{copy.reasonLabel}</legend>
              {REPORT_REASONS.map((value) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-[14px] transition ${
                    reason === value ? "border-rose-400 bg-rose-50 font-semibold text-rose-700" : "border-gray-200 bg-white text-slate-800 active:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={value}
                    checked={reason === value}
                    onChange={() => setReason(value)}
                    className="h-4 w-4 accent-rose-500"
                  />
                  {copy.reasons[value]}
                </label>
              ))}
            </fieldset>

            <label className="mt-4 block">
              <span className="mb-1.5 flex items-center justify-between text-[13px] font-semibold text-gray-600">
                <span>{copy.detailLabel}</span>
                <span className="font-normal text-gray-400">{copy.detailOptional}</span>
              </span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value.slice(0, MAX_REPORT_MESSAGE_LENGTH))}
                maxLength={MAX_REPORT_MESSAGE_LENGTH}
                rows={3}
                placeholder={copy.detailPlaceholder}
                className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-[14px] leading-relaxed outline-none focus:border-gray-400"
              />
              <span className="mt-1 block text-right text-[12px] text-gray-400" aria-live="polite">{noteRemaining}</span>
            </label>

            <p className="mt-1 text-[12px] leading-relaxed text-gray-500">{copy.noAutoAction}</p>

            {phase === "error" ? (
              <p className="mt-2 text-[13px] text-red-500" role="alert">{copy.reportError}</p>
            ) : null}

            <button
              type="submit"
              disabled={phase === "submitting"}
              className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-rose-500 text-[15px] font-semibold text-white transition active:bg-rose-600 disabled:opacity-60"
            >
              {phase === "submitting" ? <Loader2 size={18} className="animate-spin" aria-label={copy.submitting} /> : copy.submit}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
