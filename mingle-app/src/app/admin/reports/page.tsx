import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, LogOut, MessageSquare, Send, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mingle Admin Reports",
};

const REPORT_PAGE_SIZE = 20;
const REPORT_STATUSES = ["open", "in_review", "resolved", "rejected"] as const;
type ReportStatus = (typeof REPORT_STATUSES)[number];
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
  return raw === "all" || REPORT_STATUSES.includes(raw as ReportStatus) ? raw as ReportStatus | "all" : "all";
}

function reportsPath(status: string, page: number, result?: string): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  if (result) params.set("result", result);
  const query = params.toString();
  return query ? `/admin/reports?${query}` : "/admin/reports";
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

async function createReportReplyAction(formData: FormData) {
  "use server";
  const returnTo = readFormString(formData.get("returnTo")) || "/admin/reports";
  if (!(await isAdminAuthenticated())) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}result=session_required`);

  const reportId = readFormString(formData.get("reportId")).trim();
  const message = readFormString(formData.get("message")).trim().slice(0, 4000);
  if (!reportId || message.length < 2) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}result=invalid_reply`);

  const report = await prisma.userReport.findUnique({ where: { id: reportId }, select: { id: true } });
  if (!report) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}result=report_not_found`);

  await prisma.$transaction([
    prisma.userReportReply.create({
      data: { reportId, authorType: "team", message },
    }),
    prisma.userReport.update({
      where: { id: reportId },
      data: { status: "in_review" },
    }),
  ]);

  revalidatePath("/admin/reports");
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}result=reply_sent`);
}

async function updateReportStatusAction(formData: FormData) {
  "use server";
  const returnTo = readFormString(formData.get("returnTo")) || "/admin/reports";
  if (!(await isAdminAuthenticated())) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}result=session_required`);

  const reportId = readFormString(formData.get("reportId")).trim();
  const status = readFormString(formData.get("status")).trim() as ReportStatus;
  if (!reportId || !REPORT_STATUSES.includes(status)) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}result=invalid_status`);

  await prisma.userReport.update({ where: { id: reportId }, data: { status } });
  revalidatePath("/admin/reports");
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}result=status_updated`);
}

async function loadReports(status: ReportStatus | "all", requestedPage: number) {
  const where = status === "all" ? {} : { status };
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
      reason: true,
      message: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      reporter: { select: { id: true, name: true, email: true, displayName: true } },
      reportedUser: { select: { id: true, name: true, email: true, displayName: true } },
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

function resultMessage(result: string): string {
  switch (result) {
    case "reply_sent": return "Reply sent and report moved to in review.";
    case "status_updated": return "Report status updated.";
    case "session_required": return "Please sign in again before changing a report.";
    case "invalid_reply": return "Please enter a reply.";
    case "report_not_found": return "The report no longer exists.";
    default: return result ? "The report action could not be completed." : "";
  }
}

export default async function AdminReportsPage({ searchParams }: AdminReportsPageProps) {
  if (!(await isAdminAuthenticated())) redirect("/admin");

  const params = await searchParams;
  const status = normalizeStatus(takeFirst(params.status));
  const page = normalizePage(takeFirst(params.page));
  const result = takeFirst(params.result);
  const data = await loadReports(status, page);
  const returnTo = reportsPath(status, data.page);

  return (
    <main className="h-svh w-full overflow-y-auto bg-[#f8fafc] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-rose-100 text-rose-600"><AlertTriangle className="h-5 w-5" aria-hidden="true" /></span>
            <div><p className="text-sm font-semibold text-rose-600">User reports</p><h1 className="text-2xl font-semibold">Mingle Admin</h1></div>
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

      <nav className="mx-auto flex w-full max-w-6xl flex-wrap gap-2 px-5" aria-label="Report filters">
        {(["all", ...REPORT_STATUSES] as const).map((filter) => (
          <Link key={filter} href={reportsPath(filter, 1)} className={`inline-flex h-10 items-center rounded-md border px-4 text-sm font-semibold ${status === filter ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
            {filter === "all" ? "All" : statusLabel(filter)}
          </Link>
        ))}
      </nav>

      {resultMessage(result) ? <p className="mx-auto mt-4 w-full max-w-6xl rounded-md border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-700">{resultMessage(result)}</p> : null}

      <section className="mx-auto mt-5 w-full max-w-6xl space-y-4 px-5 pb-10">
        {data.reports.length === 0 ? <div className="rounded-lg border border-slate-200 bg-white p-10 text-center"><ShieldCheck className="mx-auto mb-3 h-8 w-8 text-slate-400" aria-hidden="true" /><p className="text-base font-semibold text-slate-800">No reports</p></div> : data.reports.map((report) => {
          const reporter = report.reporter.displayName || report.reporter.name || report.reporter.email || report.reporter.id;
          const reported = report.reportedUser.displayName || report.reportedUser.name || report.reportedUser.email || report.reportedUser.id;
          const replyInputId = `report-reply-${report.id}`;
          return (
            <article key={report.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div><div className="mb-2 flex flex-wrap items-center gap-2"><span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">{reasonLabel(report.reason)}</span><span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">{statusLabel(report.status)}</span></div><p className="text-sm text-slate-600"><span className="font-semibold">Reporter:</span> {reporter}</p><p className="mt-1 text-sm text-slate-600"><span className="font-semibold">Reported user:</span> {reported}</p><p className="mt-1 text-xs text-slate-400">{report.reportedUser.id}</p></div>
                <time className="shrink-0 text-sm text-slate-500" dateTime={report.createdAt.toISOString()}>{REPORT_DATE_FORMATTER.format(report.createdAt)}</time>
              </div>
              {report.message ? <div className="mb-4 border-l-2 border-rose-300 py-1 pl-4"><p className="mb-2 text-xs font-semibold uppercase text-slate-500">User report</p><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{report.message}</p></div> : null}
              <div className="space-y-3">{report.replies.map((reply) => <div key={reply.id} className="border-l-2 border-emerald-300 py-1 pl-4"><div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase text-slate-500"><span><MessageSquare className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />{reply.authorType === "team" ? "Team reply" : reply.authorType}</span><time dateTime={reply.createdAt.toISOString()}>{REPORT_DATE_FORMATTER.format(reply.createdAt)}</time></div><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{reply.message}</p></div>)}</div>
              <form action={updateReportStatusAction} className="mt-4 flex flex-wrap items-center gap-2"><input name="reportId" type="hidden" value={report.id} /><input name="returnTo" type="hidden" value={returnTo} /><select name="status" defaultValue={report.status} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="open">Open</option><option value="in_review">In review</option><option value="resolved">Resolved</option><option value="rejected">Rejected</option></select><button className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="submit">Update status</button></form>
              <form action={createReportReplyAction} className="mt-4 space-y-3"><input name="reportId" type="hidden" value={report.id} /><input name="returnTo" type="hidden" value={returnTo} /><label className="block text-sm font-medium text-slate-700" htmlFor={replyInputId}>Reply</label><textarea id={replyInputId} name="message" maxLength={4000} minLength={2} required className="min-h-24 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" placeholder="Write a response that the reporter will see in the app." /><div className="flex justify-end"><button className="inline-flex h-10 items-center gap-2 rounded-md bg-amber-500 px-4 text-sm font-semibold text-white hover:bg-amber-600" type="submit"><Send className="h-4 w-4" aria-hidden="true" />Send reply</button></div></form>
            </article>
          );
        })}
        {data.totalPages > 1 ? <nav className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4" aria-label="Report pagination"><Link className={`inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-semibold ${data.page > 1 ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"}`} href={reportsPath(status, Math.max(1, data.page - 1))}><ChevronLeft className="h-4 w-4" aria-hidden="true" />Previous</Link><span className="text-sm font-medium text-slate-600">Page {data.page} of {data.totalPages}</span><Link className={`inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-semibold ${data.page < data.totalPages ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"}`} href={reportsPath(status, data.page + 1)}>Next<ChevronRight className="h-4 w-4" aria-hidden="true" /></Link></nav> : null}
      </section>
    </main>
  );
}
