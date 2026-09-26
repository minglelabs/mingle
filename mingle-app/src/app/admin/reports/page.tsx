import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, EyeOff, FileText, LogOut, MessageSquare, Send, ShieldBan, ShieldCheck, UserRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";
import {
  hideCommentByModerator,
  hidePostByModerator,
  hideUserByModerator,
  isClosingStatus,
  isValidModerationAction,
  isValidReportStatus,
  normalizeReportReply,
  restrictUserByModerator,
  shouldAdvanceOnReply,
  unhideCommentByModerator,
  unhidePostByModerator,
  unhideUserByModerator,
  unrestrictUserByModerator,
  type ModerationAction,
  type ReportStatus,
} from "@/server/reports/moderation-service";
import { createPostNotification } from "@/server/notifications/create-post-notification";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mingle Admin Reports",
};

const REPORT_PAGE_SIZE = 20;
const REPORT_STATUSES: readonly ReportStatus[] = ["open", "in_review", "resolved", "rejected"] as const;
const TARGET_TYPES = ["user", "post", "comment"] as const;
type TargetType = (typeof TARGET_TYPES)[number];

type AdminReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const REPORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

function readFormString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function takeFirst(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

function normalizePage(raw: string): number {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function normalizeStatus(raw: string): ReportStatus | "all" {
  return raw === "all" || REPORT_STATUSES.includes(raw as ReportStatus) ? (raw as ReportStatus | "all") : "all";
}

function normalizeType(raw: string): TargetType | "all" {
  return raw === "all" || TARGET_TYPES.includes(raw as TargetType) ? (raw as TargetType | "all") : "all";
}

function reportsPath(status: string, type: string, page: number, result?: string): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (type !== "all") params.set("type", type);
  if (page > 1) params.set("page", String(page));
  if (result) params.set("result", result);
  const query = params.toString();
  return query ? `/admin/reports?${query}` : "/admin/reports";
}

function withResult(returnTo: string, result: string): string {
  return `${returnTo}${returnTo.includes("?") ? "&" : "?"}result=${result}`;
}

function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  };
}

async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
}

async function logoutAdminAction() {
  "use server";
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, "", { ...adminCookieOptions(), maxAge: 0 });
  redirect("/admin");
}

/**
 * Post an operator reply to a report. Works for every report type (user, post,
 * comment) since it keys only on the report id. Matches the pre-integration
 * behavior: 2–4000 chars, and posting a reply moves an `open` report to
 * `in_review`. The reporter reads these replies in /account/reports.
 */
async function createReportReplyAction(formData: FormData) {
  "use server";
  const returnTo = readFormString(formData.get("returnTo")) || "/admin/reports";
  if (!(await isAdminAuthenticated())) redirect(withResult(returnTo, "session_required"));

  const reportId = readFormString(formData.get("reportId")).trim();
  const message = normalizeReportReply(readFormString(formData.get("message")));
  if (!reportId || !message) redirect(withResult(returnTo, "invalid_reply"));

  const report = await prisma.userReport.findUnique({ where: { id: reportId }, select: { id: true, status: true } });
  if (!report) redirect(withResult(returnTo, "report_not_found"));

  await prisma.$transaction([
    prisma.userReportReply.create({
      data: { reportId, authorType: "team", message },
    }),
    // Only nudge an untouched report forward; do not reopen a closed one.
    ...(shouldAdvanceOnReply(report.status)
      ? [prisma.userReport.update({ where: { id: reportId }, data: { status: "in_review" } })]
      : []),
  ]);

  revalidatePath("/admin/reports");
  redirect(withResult(returnTo, "reply_sent"));
}

/** Persist the operator's processing note on a report. */
async function saveReportNoteAction(formData: FormData) {
  "use server";
  const returnTo = readFormString(formData.get("returnTo")) || "/admin/reports";
  if (!(await isAdminAuthenticated())) redirect(withResult(returnTo, "session_required"));

  const reportId = readFormString(formData.get("reportId")).trim();
  const adminNote = readFormString(formData.get("adminNote")).trim().slice(0, 4000);
  if (!reportId) redirect(withResult(returnTo, "invalid_note"));

  const report = await prisma.userReport.findUnique({ where: { id: reportId }, select: { id: true } });
  if (!report) redirect(withResult(returnTo, "report_not_found"));

  await prisma.userReport.update({ where: { id: reportId }, data: { adminNote: adminNote || null } });
  revalidatePath("/admin/reports");
  redirect(withResult(returnTo, "note_saved"));
}

/**
 * Change a report's status. Closing it (resolved / rejected) stamps
 * resolvedAt and notifies the REPORTER (report_resolved). The notification is
 * fire-and-forget — the stub never throws, and the real impl must not either.
 */
async function updateReportStatusAction(formData: FormData) {
  "use server";
  const returnTo = readFormString(formData.get("returnTo")) || "/admin/reports";
  if (!(await isAdminAuthenticated())) redirect(withResult(returnTo, "session_required"));

  const reportId = readFormString(formData.get("reportId")).trim();
  const status = readFormString(formData.get("status")).trim();
  if (!reportId || !isValidReportStatus(status)) redirect(withResult(returnTo, "invalid_status"));

  const existing = await prisma.userReport.findUnique({
    where: { id: reportId },
    select: { id: true, reporterId: true, status: true },
  });
  if (!existing) redirect(withResult(returnTo, "report_not_found"));

  const closing = isClosingStatus(status);
  await prisma.userReport.update({
    where: { id: reportId },
    data: { status, resolvedAt: closing ? new Date() : null },
  });

  // Only notify on a fresh transition INTO a closed state.
  if (closing && !isClosingStatus(existing.status as ReportStatus)) {
    await createPostNotification({ type: "report_resolved", recipientId: existing.reporterId, actorId: existing.reporterId, reportId: existing.id });
  }

  revalidatePath("/admin/reports");
  redirect(withResult(returnTo, "status_updated"));
}

/**
 * Apply a moderation action to the report's target and record it on the report
 * (moderationAction). Hiding uses the visibility stamps the feed already reads,
 * so it takes effect immediately and survives re-login until an operator
 * reverses it. Unhide restores only content that was public (see the
 * moderation-service unhide contract).
 */
async function applyModerationAction(formData: FormData) {
  "use server";
  const returnTo = readFormString(formData.get("returnTo")) || "/admin/reports";
  if (!(await isAdminAuthenticated())) redirect(withResult(returnTo, "session_required"));

  const reportId = readFormString(formData.get("reportId")).trim();
  const action = readFormString(formData.get("action")).trim();
  if (!reportId || !isValidModerationAction(action)) redirect(withResult(returnTo, "invalid_action"));

  const report = await prisma.userReport.findUnique({
    where: { id: reportId },
    select: { id: true, targetType: true, targetPostId: true, targetCommentId: true, reportedUserId: true },
  });
  if (!report) redirect(withResult(returnTo, "report_not_found"));

  await prisma.$transaction(async (tx) => {
    await applyOneAction(tx, action as ModerationAction, {
      postId: report.targetPostId,
      commentId: report.targetCommentId,
      userId: report.reportedUserId,
    });
    await tx.userReport.update({ where: { id: reportId }, data: { moderationAction: action } });
  });

  revalidatePath("/admin/reports");
  redirect(withResult(returnTo, "action_applied"));
}

async function applyOneAction(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  action: ModerationAction,
  target: { postId: string | null; commentId: string | null; userId: string },
): Promise<void> {
  switch (action) {
    case "hide_content":
      if (target.postId) await hidePostByModerator(tx, target.postId);
      else if (target.commentId) await hideCommentByModerator(tx, target.commentId);
      return;
    case "unhide_content":
      if (target.postId) await unhidePostByModerator(tx, target.postId);
      else if (target.commentId) await unhideCommentByModerator(tx, target.commentId);
      return;
    case "hide_user":
      await hideUserByModerator(tx, target.userId);
      return;
    case "unhide_user":
      await unhideUserByModerator(tx, target.userId);
      return;
    case "restrict_user":
      await restrictUserByModerator(tx, target.userId);
      return;
    case "unrestrict_user":
      await unrestrictUserByModerator(tx, target.userId);
      return;
  }
}

async function loadReports(status: ReportStatus | "all", type: TargetType | "all", requestedPage: number) {
  const where = {
    ...(status === "all" ? {} : { status }),
    ...(type === "all" ? {} : { targetType: type }),
  };
  const [totalCount, openCount, filteredCount] = await prisma.$transaction([
    prisma.userReport.count(),
    prisma.userReport.count({ where: { status: { in: ["open", "in_review"] } } }),
    prisma.userReport.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(filteredCount / REPORT_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const reports = filteredCount === 0 ? [] : await prisma.userReport.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * REPORT_PAGE_SIZE,
    take: REPORT_PAGE_SIZE,
    select: {
      id: true,
      targetType: true,
      targetPostId: true,
      targetCommentId: true,
      reason: true,
      message: true,
      status: true,
      adminNote: true,
      moderationAction: true,
      createdAt: true,
      resolvedAt: true,
      reporter: { select: { id: true, name: true, email: true } },
      reportedUser: { select: { id: true, name: true, email: true, moderationHiddenAt: true, moderationRestrictedAt: true } },
      replies: {
        orderBy: { createdAt: "asc" },
        select: { id: true, authorType: true, message: true, createdAt: true },
      },
    },
  });

  return { reports, totalCount, openCount, filteredCount, totalPages, page };
}

function statusLabel(status: string): string {
  switch (status) {
    case "in_review": return "In review";
    case "resolved": return "Resolved";
    case "rejected": return "Rejected";
    default: return "Open";
  }
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case "spam": return "Spam";
    case "harassment": return "Harassment";
    case "inappropriate": return "Inappropriate content";
    case "impersonation": return "Impersonation";
    case "other": return "Other";
    default: return reason;
  }
}

function targetTypeLabel(type: string): string {
  switch (type) {
    case "post": return "Post";
    case "comment": return "Comment";
    default: return "User";
  }
}

function resultMessage(result: string): string {
  switch (result) {
    case "status_updated": return "Report status updated.";
    case "note_saved": return "Processing note saved.";
    case "action_applied": return "Moderation action applied.";
    case "reply_sent": return "Reply sent to the reporter.";
    case "invalid_reply": return "Please enter a reply of at least 2 characters.";
    case "session_required": return "Please sign in again before changing a report.";
    case "invalid_note": return "Could not save the note.";
    case "invalid_status": return "Invalid status.";
    case "invalid_action": return "Invalid moderation action.";
    case "report_not_found": return "The report no longer exists.";
    default: return result ? "The report action could not be completed." : "";
  }
}

export default async function AdminReportsPage({ searchParams }: AdminReportsPageProps) {
  if (!(await isAdminAuthenticated())) redirect("/admin");

  const params = await searchParams;
  const status = normalizeStatus(takeFirst(params.status));
  const type = normalizeType(takeFirst(params.type));
  const page = normalizePage(takeFirst(params.page));
  const result = takeFirst(params.result);
  const data = await loadReports(status, type, page);
  const returnTo = reportsPath(status, type, data.page);

  return (
    <main className="h-svh w-full overflow-y-auto bg-[#f8fafc] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-rose-100 text-rose-600"><AlertTriangle className="h-5 w-5" aria-hidden="true" /></span>
            <div><p className="text-sm font-semibold text-rose-600">Reports</p><h1 className="text-2xl font-semibold">Mingle Admin</h1></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" href="/admin">Feedback</Link>
            <form action={logoutAdminAction}><button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="submit"><LogOut className="h-4 w-4" aria-hidden="true" />Sign out</button></form>
          </div>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-3 px-5 py-5 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-sm font-medium text-slate-500">Total reports</p><p className="mt-2 text-2xl font-semibold">{data.totalCount}</p></div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-medium text-amber-700">Open / in review</p><p className="mt-2 text-2xl font-semibold text-amber-800">{data.openCount}</p></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-sm font-medium text-slate-500">Showing</p><p className="mt-2 text-2xl font-semibold">{data.filteredCount}</p></div>
      </section>

      <nav className="mx-auto flex w-full max-w-6xl flex-wrap gap-2 px-5" aria-label="Status filters">
        {(["all", ...REPORT_STATUSES] as const).map((filter) => (
          <Link key={filter} href={reportsPath(filter, type, 1)} className={`inline-flex h-9 items-center rounded-md border px-3 text-sm font-semibold ${status === filter ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
            {filter === "all" ? "All status" : statusLabel(filter)}
          </Link>
        ))}
      </nav>
      <nav className="mx-auto mt-2 flex w-full max-w-6xl flex-wrap gap-2 px-5" aria-label="Target type filters">
        {(["all", ...TARGET_TYPES] as const).map((filter) => (
          <Link key={filter} href={reportsPath(status, filter, 1)} className={`inline-flex h-9 items-center rounded-md border px-3 text-sm font-semibold ${type === filter ? "border-rose-500 bg-rose-500 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
            {filter === "all" ? "All types" : targetTypeLabel(filter)}
          </Link>
        ))}
      </nav>

      {resultMessage(result) ? <p className="mx-auto mt-4 w-full max-w-6xl rounded-md border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-700">{resultMessage(result)}</p> : null}

      <section className="mx-auto mt-5 w-full max-w-6xl space-y-4 px-5 pb-10">
        {data.reports.length === 0 ? <div className="rounded-lg border border-slate-200 bg-white p-10 text-center"><ShieldCheck className="mx-auto mb-3 h-8 w-8 text-slate-400" aria-hidden="true" /><p className="text-base font-semibold text-slate-800">No reports</p></div> : data.reports.map((report) => {
          const reporter = report.reporter.name || report.reporter.email || report.reporter.id;
          const reported = report.reportedUser.name || report.reportedUser.email || report.reportedUser.id;
          const noteInputId = `report-note-${report.id}`;
          const replyInputId = `report-reply-${report.id}`;
          const isContent = report.targetType === "post" || report.targetType === "comment";
          const targetIcon = report.targetType === "post" ? <FileText className="h-3.5 w-3.5" aria-hidden="true" /> : report.targetType === "comment" ? <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> : <UserRound className="h-3.5 w-3.5" aria-hidden="true" />;
          return (
            <article key={report.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">{targetIcon}{targetTypeLabel(report.targetType)}</span>
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">{reasonLabel(report.reason)}</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">{statusLabel(report.status)}</span>
                    {report.reportedUser.moderationHiddenAt ? <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700"><EyeOff className="h-3.5 w-3.5" aria-hidden="true" />User hidden</span> : null}
                    {report.reportedUser.moderationRestrictedAt ? <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"><ShieldBan className="h-3.5 w-3.5" aria-hidden="true" />Restricted</span> : null}
                  </div>
                  <p className="text-sm text-slate-600"><span className="font-semibold">Reporter:</span> {reporter}</p>
                  <p className="mt-1 text-sm text-slate-600"><span className="font-semibold">{isContent ? "Content author" : "Reported user"}:</span> {reported}</p>
                  {report.targetPostId ? <p className="mt-1 text-xs text-slate-400">post: {report.targetPostId}</p> : null}
                  {report.targetCommentId ? <p className="mt-1 text-xs text-slate-400">comment: {report.targetCommentId}</p> : null}
                </div>
                <time className="shrink-0 text-sm text-slate-500" dateTime={report.createdAt.toISOString()}>{REPORT_DATE_FORMATTER.format(report.createdAt)}</time>
              </div>
              {report.message ? <div className="mb-4 border-l-2 border-rose-300 py-1 pl-4"><p className="mb-2 text-xs font-semibold uppercase text-slate-500">Reporter note</p><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{report.message}</p></div> : null}

              <form action={updateReportStatusAction} className="flex flex-wrap items-center gap-2">
                <input name="reportId" type="hidden" value={report.id} />
                <input name="returnTo" type="hidden" value={returnTo} />
                <select name="status" defaultValue={report.status} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="open">Open</option><option value="in_review">In review</option><option value="resolved">Resolved</option><option value="rejected">Rejected</option></select>
                <button className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="submit">Update status</button>
              </form>

              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Moderation actions">
                {isContent ? (
                  <>
                    <ModAction reportId={report.id} returnTo={returnTo} action="hide_content" label="Hide content" tone="danger" />
                    <ModAction reportId={report.id} returnTo={returnTo} action="unhide_content" label="Unhide content" tone="neutral" />
                  </>
                ) : null}
                <ModAction reportId={report.id} returnTo={returnTo} action={report.reportedUser.moderationHiddenAt ? "unhide_user" : "hide_user"} label={report.reportedUser.moderationHiddenAt ? "Unhide user" : "Hide user"} tone={report.reportedUser.moderationHiddenAt ? "neutral" : "danger"} />
                <ModAction reportId={report.id} returnTo={returnTo} action={report.reportedUser.moderationRestrictedAt ? "unrestrict_user" : "restrict_user"} label={report.reportedUser.moderationRestrictedAt ? "Remove restriction" : "Restrict user"} tone={report.reportedUser.moderationRestrictedAt ? "neutral" : "danger"} />
              </div>

              <form action={saveReportNoteAction} className="mt-4 space-y-2">
                <input name="reportId" type="hidden" value={report.id} />
                <input name="returnTo" type="hidden" value={returnTo} />
                <label className="block text-sm font-medium text-slate-700" htmlFor={noteInputId}>Processing note</label>
                <textarea id={noteInputId} name="adminNote" maxLength={4000} defaultValue={report.adminNote ?? ""} className="min-h-20 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" placeholder="Internal note about how this report was handled." />
                <div className="flex justify-end"><button className="h-10 rounded-md bg-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-700" type="submit">Save note</button></div>
              </form>

              <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Reporter conversation</p>
                {report.replies.length === 0 ? (
                  <p className="text-sm text-slate-400">No replies yet. The reporter sees your reply in their account.</p>
                ) : (
                  report.replies.map((reply) => (
                    <div key={reply.id} className="border-l-2 border-emerald-300 py-1 pl-4">
                      <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase text-slate-500">
                        <span><MessageSquare className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />{reply.authorType === "team" ? "Team reply" : reply.authorType}</span>
                        <time dateTime={reply.createdAt.toISOString()}>{REPORT_DATE_FORMATTER.format(reply.createdAt)}</time>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{reply.message}</p>
                    </div>
                  ))
                )}
                <form action={createReportReplyAction} className="space-y-2">
                  <input name="reportId" type="hidden" value={report.id} />
                  <input name="returnTo" type="hidden" value={returnTo} />
                  <label className="block text-sm font-medium text-slate-700" htmlFor={replyInputId}>Reply to reporter</label>
                  <textarea id={replyInputId} name="message" maxLength={4000} minLength={2} required className="min-h-24 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" placeholder="Write a response the reporter will see in the app." />
                  <div className="flex justify-end"><button className="inline-flex h-10 items-center gap-2 rounded-md bg-amber-500 px-4 text-sm font-semibold text-white hover:bg-amber-600" type="submit"><Send className="h-4 w-4" aria-hidden="true" />Send reply</button></div>
                </form>
              </div>
            </article>
          );
        })}
        {data.totalPages > 1 ? <nav className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4" aria-label="Report pagination"><Link className={`inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-semibold ${data.page > 1 ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"}`} href={reportsPath(status, type, Math.max(1, data.page - 1))}><ChevronLeft className="h-4 w-4" aria-hidden="true" />Previous</Link><span className="text-sm font-medium text-slate-600">Page {data.page} of {data.totalPages}</span><Link className={`inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-semibold ${data.page < data.totalPages ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"}`} href={reportsPath(status, type, data.page + 1)}>Next<ChevronRight className="h-4 w-4" aria-hidden="true" /></Link></nav> : null}
      </section>
    </main>
  );
}

function ModAction({ reportId, returnTo, action, label, tone }: { reportId: string; returnTo: string; action: ModerationAction; label: string; tone: "danger" | "neutral" }) {
  return (
    <form action={applyModerationAction}>
      <input name="reportId" type="hidden" value={reportId} />
      <input name="returnTo" type="hidden" value={returnTo} />
      <input name="action" type="hidden" value={action} />
      <button type="submit" className={`h-10 rounded-md border px-3 text-sm font-semibold ${tone === "danger" ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>{label}</button>
    </form>
  );
}
