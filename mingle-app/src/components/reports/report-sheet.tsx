"use client";

/**
 * CONTRACT STUB — the reports/moderation UI replaces the body; the props are frozen.
 *
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

export default function ReportSheet(props: ReportSheetProps) {
  void props;
  return null;
}
