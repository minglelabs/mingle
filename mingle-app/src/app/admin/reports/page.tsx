import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { EyeOff, FileText, MessageSquare, Send, ShieldBan, ShieldCheck, UserRound } from "lucide-react";
import type { AccountBadgeFlags } from "@/lib/account-badge";
import { prisma } from "@/lib/prisma";
import { sanitizeAdminReturnTo } from "@/lib/admin-return-to";
import { requireAdmin } from "@/server/admin/guard";
import {
  contentModerationToggle,
  hideCommentByModerator,
  hidePostByModerator,
  hideUserByModerator,
  isClosingStatus,
  isValidModerationAction,
  isValidReportStatus,
  normalizeReportReply,
  reportContentExcerpt,
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
import {
  AccountBadgeChip,
  AdminButton,
  AdminCard,
  AdminChip,
  AdminEmptyState,
  AdminFilterLink,
  AdminNotice,
  AdminPage,
  AdminPageHeader,
  AdminPagination,
  adminInputClassName,
  adminLabelClassName,
  adminTextareaClassName,
} from "../_components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "신고함",
};

const REPORT_PAGE_SIZE = 20;
const REPORT_STATUSES: readonly ReportStatus[] = ["open", "in_review", "resolved", "rejected"] as const;
const TARGET_TYPES = ["user", "post", "comment"] as const;
type TargetType = (typeof TARGET_TYPES)[number];

type AdminReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const REPORT_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

/** Identity fields shown for every person on a report card, badge flags included. */
const REPORT_PERSON_SELECT = { id: true, name: true, handle: true, email: true, isOfficial: true, isOperator: true } as const;

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

/** Default list for report actions when the posted `returnTo` is missing or refused. */
const ADMIN_REPORTS_PATH = "/admin/reports";

function withResult(returnTo: string, result: string): string {
  return `${returnTo}${returnTo.includes("?") ? "&" : "?"}result=${result}`;
}

/**
 * Post an operator reply to a report. Works for every report type (user, post,
 * comment) since it keys only on the report id. Matches the pre-integration
 * behavior: 2–4000 chars, and posting a reply moves an `open` report to
 * `in_review`. The reporter reads these replies in /account/reports.
 */
async function createReportReplyAction(formData: FormData) {
  "use server";
  const returnTo = sanitizeAdminReturnTo(formData.get("returnTo"), ADMIN_REPORTS_PATH);
  await requireAdmin(returnTo);

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
  const returnTo = sanitizeAdminReturnTo(formData.get("returnTo"), ADMIN_REPORTS_PATH);
  await requireAdmin(returnTo);

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
  const returnTo = sanitizeAdminReturnTo(formData.get("returnTo"), ADMIN_REPORTS_PATH);
  await requireAdmin(returnTo);

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
  const returnTo = sanitizeAdminReturnTo(formData.get("returnTo"), ADMIN_REPORTS_PATH);
  await requireAdmin(returnTo);

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
      reporter: { select: REPORT_PERSON_SELECT },
      // The reported content itself, so an operator can judge without leaving the console.
      targetPost: {
        select: {
          id: true,
          sourceText: true,
          imageObjectKey: true,
          visibility: true,
          isDeleted: true,
          moderationHiddenAt: true,
          author: { select: REPORT_PERSON_SELECT },
        },
      },
      targetComment: {
        select: {
          id: true,
          postId: true,
          sourceText: true,
          isDeleted: true,
          moderationHiddenAt: true,
          author: { select: REPORT_PERSON_SELECT },
        },
      },
      reportedUser: { select: { ...REPORT_PERSON_SELECT, moderationHiddenAt: true, moderationRestrictedAt: true } },
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
    case "in_review": return "검토 중";
    case "resolved": return "처리 완료";
    case "rejected": return "반려";
    default: return "접수";
  }
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case "spam": return "스팸";
    case "harassment": return "괴롭힘";
    case "inappropriate": return "부적절한 콘텐츠";
    case "impersonation": return "사칭";
    case "other": return "기타";
    default: return reason;
  }
}

function targetTypeLabel(type: string): string {
  switch (type) {
    case "post": return "게시물";
    case "comment": return "댓글";
    default: return "사용자";
  }
}

const SUCCESS_RESULTS = new Set(["status_updated", "note_saved", "action_applied", "reply_sent"]);

function resultMessage(result: string): string {
  switch (result) {
    case "status_updated": return "신고 상태를 바꿨습니다.";
    case "note_saved": return "처리 메모를 저장했습니다.";
    case "action_applied": return "조치를 적용했습니다.";
    case "reply_sent": return "신고자에게 답장을 보냈습니다.";
    case "invalid_reply": return "답장을 2자 이상 입력하세요.";
    case "invalid_note": return "메모를 저장하지 못했습니다.";
    case "invalid_status": return "올바르지 않은 상태입니다.";
    case "invalid_action": return "올바르지 않은 조치입니다.";
    case "report_not_found": return "이 신고는 더 이상 없습니다.";
    default: return result ? "신고 작업을 완료하지 못했습니다." : "";
  }
}

type ReportPerson = AccountBadgeFlags & { id: string; name: string | null; handle: string | null; email: string | null };

function personLabel(person: ReportPerson): string {
  return person.name || (person.handle ? `@${person.handle}` : "") || person.email || person.id;
}

/** "Label: name" with the account-kind chip, so a report about an operator account is obvious. */
function PersonLine({ label, person }: { label: string; person: ReportPerson }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-slate-600">
      <span className="font-semibold text-slate-700">{label}</span>
      <span className="min-w-0 break-words">{personLabel(person)}</span>
      <AccountBadgeChip flags={person} />
    </p>
  );
}

export default async function AdminReportsPage({ searchParams }: AdminReportsPageProps) {
  const params = await searchParams;
  const status = normalizeStatus(takeFirst(params.status));
  const type = normalizeType(takeFirst(params.type));
  const page = normalizePage(takeFirst(params.page));
  await requireAdmin(reportsPath(status, type, page));

  const result = takeFirst(params.result);
  const data = await loadReports(status, type, page);
  const returnTo = reportsPath(status, type, data.page);
  const message = resultMessage(result);

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ href: "/admin/more", label: "더보기" }}
        description={`전체 ${data.totalCount}건 · 처리 대기 ${data.openCount}건`}
        title="신고함"
      />

      <nav aria-label="상태 필터" className="flex flex-wrap gap-2">
        {(["all", ...REPORT_STATUSES] as const).map((filter) => (
          <AdminFilterLink active={status === filter} href={reportsPath(filter, type, 1)} key={filter}>
            {filter === "all" ? "모든 상태" : statusLabel(filter)}
          </AdminFilterLink>
        ))}
      </nav>
      <nav aria-label="대상 필터" className="mt-2 flex flex-wrap gap-2">
        {(["all", ...TARGET_TYPES] as const).map((filter) => (
          <AdminFilterLink active={type === filter} href={reportsPath(status, filter, 1)} key={filter}>
            {filter === "all" ? "모든 대상" : targetTypeLabel(filter)}
          </AdminFilterLink>
        ))}
      </nav>
      <p className="mt-2 text-xs text-slate-500">이 조건의 신고 {data.filteredCount}건</p>

      {message ? (
        <AdminNotice className="mt-3" tone={SUCCESS_RESULTS.has(result) ? "success" : "error"}>
          {message}
        </AdminNotice>
      ) : null}

      <div className="mt-3 space-y-3">
        {data.reports.length === 0 ? <AdminEmptyState icon={ShieldCheck} title="신고가 없습니다" /> : data.reports.map((report) => {
          const noteInputId = `report-note-${report.id}`;
          const replyInputId = `report-reply-${report.id}`;
          const statusInputId = `report-status-${report.id}`;
          const isContent = report.targetType === "post" || report.targetType === "comment";
          const content = report.targetType === "post" ? report.targetPost : report.targetType === "comment" ? report.targetComment : null;
          const contentToggle = contentModerationToggle(content);
          const hasImage = report.targetType === "post" && Boolean(report.targetPost?.imageObjectKey);
          const targetIcon = report.targetType === "post" ? FileText : report.targetType === "comment" ? MessageSquare : UserRound;
          return (
            <AdminCard as="article" key={report.id}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <AdminChip icon={targetIcon}>{targetTypeLabel(report.targetType)}</AdminChip>
                <AdminChip tone="danger">{reasonLabel(report.reason)}</AdminChip>
                <AdminChip tone={report.status === "open" || report.status === "in_review" ? "warning" : "neutral"}>{statusLabel(report.status)}</AdminChip>
                {report.reportedUser.moderationHiddenAt ? <AdminChip icon={EyeOff} tone="warning">사용자 숨김</AdminChip> : null}
                {report.reportedUser.moderationRestrictedAt ? <AdminChip icon={ShieldBan} tone="danger">이용 제한</AdminChip> : null}
              </div>
              <div className="space-y-1">
                <PersonLine label="신고자" person={report.reporter} />
                <PersonLine label={isContent ? "작성자" : "신고된 사용자"} person={report.reportedUser} />
              </div>
              <time className="mt-1 block text-xs text-slate-500" dateTime={report.createdAt.toISOString()}>{REPORT_DATE_FORMATTER.format(report.createdAt)}</time>
              {report.targetPostId ? <p className="mt-1 break-all text-xs text-slate-400">게시물 {report.targetPostId}</p> : null}
              {report.targetCommentId ? <p className="mt-1 break-all text-xs text-slate-400">댓글 {report.targetCommentId}</p> : null}

              {isContent ? (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-500">
                    <span>신고된 {targetTypeLabel(report.targetType)}</span>
                    {content?.author ? (
                      <>
                        <span className="min-w-0 break-words font-normal text-slate-600">· {personLabel(content.author)}</span>
                        <AccountBadgeChip flags={content.author} />
                      </>
                    ) : null}
                    {content?.moderationHiddenAt ? <AdminChip tone="warning">운영자가 숨김</AdminChip> : null}
                    {content?.isDeleted ? <AdminChip>작성자가 삭제</AdminChip> : null}
                    {report.targetType === "post" && report.targetPost && report.targetPost.visibility !== "public" ? <AdminChip>{report.targetPost.visibility}</AdminChip> : null}
                  </div>
                  {content ? (
                    <div className="flex gap-3">
                      {hasImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt="신고된 게시물 사진" className="h-20 w-20 shrink-0 rounded-lg border border-slate-200 bg-white object-cover" loading="lazy" src={`/admin/reports/${encodeURIComponent(report.id)}/image`} />
                      ) : null}
                      <p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{reportContentExcerpt(content.sourceText) || <span className="italic text-slate-400">텍스트 없음</span>}</p>
                    </div>
                  ) : (
                    <p className="text-sm italic text-slate-400">신고된 콘텐츠가 더 이상 없습니다.</p>
                  )}
                </div>
              ) : null}
              {report.message ? (
                <div className="mt-3 border-l-2 border-rose-300 py-1 pl-3">
                  <p className="mb-1 text-xs font-semibold text-slate-500">신고 내용</p>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{report.message}</p>
                </div>
              ) : null}

              <form action={updateReportStatusAction} className="mt-4">
                <input name="reportId" type="hidden" value={report.id} />
                <input name="returnTo" type="hidden" value={returnTo} />
                <label className={adminLabelClassName} htmlFor={statusInputId}>처리 상태</label>
                <div className="flex gap-2">
                  <select className={`${adminInputClassName} flex-1`} defaultValue={report.status} id={statusInputId} name="status">
                    {REPORT_STATUSES.map((option) => <option key={option} value={option}>{statusLabel(option)}</option>)}
                  </select>
                  <AdminButton className="shrink-0" type="submit">변경</AdminButton>
                </div>
              </form>

              <div aria-label="조치" className="mt-3 flex flex-wrap gap-2" role="group">
                {isContent && contentToggle ? (
                  <ModAction action={contentToggle} label={contentToggle === "unhide_content" ? "콘텐츠 숨김 해제" : "콘텐츠 숨기기"} reportId={report.id} returnTo={returnTo} tone={contentToggle === "unhide_content" ? "neutral" : "danger"} />
                ) : null}
                <ModAction action={report.reportedUser.moderationHiddenAt ? "unhide_user" : "hide_user"} label={report.reportedUser.moderationHiddenAt ? "사용자 숨김 해제" : "사용자 숨기기"} reportId={report.id} returnTo={returnTo} tone={report.reportedUser.moderationHiddenAt ? "neutral" : "danger"} />
                <ModAction action={report.reportedUser.moderationRestrictedAt ? "unrestrict_user" : "restrict_user"} label={report.reportedUser.moderationRestrictedAt ? "제한 해제" : "이용 제한"} reportId={report.id} returnTo={returnTo} tone={report.reportedUser.moderationRestrictedAt ? "neutral" : "danger"} />
              </div>

              <form action={saveReportNoteAction} className="mt-4 space-y-2">
                <input name="reportId" type="hidden" value={report.id} />
                <input name="returnTo" type="hidden" value={returnTo} />
                <label className={adminLabelClassName} htmlFor={noteInputId}>처리 메모</label>
                <textarea className={`${adminTextareaClassName} min-h-20`} defaultValue={report.adminNote ?? ""} id={noteInputId} maxLength={4000} name="adminNote" placeholder="이 신고를 어떻게 처리했는지 팀 내부용으로 남기세요." />
                <div className="flex justify-end"><AdminButton type="submit">메모 저장</AdminButton></div>
              </form>

              <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-500">신고자와 주고받은 답장</p>
                {report.replies.length === 0 ? (
                  <p className="text-sm text-slate-400">아직 답장이 없습니다. 신고자는 앱의 계정 화면에서 답장을 봅니다.</p>
                ) : (
                  report.replies.map((reply) => (
                    <div className="border-l-2 border-sky-300 py-1 pl-3" key={reply.id}>
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
                        <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />{reply.authorType === "team" ? "팀 답장" : "신고자"}</span>
                        <time dateTime={reply.createdAt.toISOString()}>{REPORT_DATE_FORMATTER.format(reply.createdAt)}</time>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{reply.message}</p>
                    </div>
                  ))
                )}
                <form action={createReportReplyAction} className="space-y-2">
                  <input name="reportId" type="hidden" value={report.id} />
                  <input name="returnTo" type="hidden" value={returnTo} />
                  <label className={adminLabelClassName} htmlFor={replyInputId}>신고자에게 답장</label>
                  <textarea className={`${adminTextareaClassName} min-h-24`} id={replyInputId} maxLength={4000} minLength={2} name="message" placeholder="신고자가 앱에서 볼 답장을 쓰세요." required />
                  <div className="flex justify-end"><AdminButton type="submit" variant="primary"><Send className="h-4 w-4" aria-hidden="true" />답장 보내기</AdminButton></div>
                </form>
              </div>
            </AdminCard>
          );
        })}
        {data.totalPages > 1 ? (
          <AdminPagination
            label="신고 페이지"
            nextHref={data.page < data.totalPages ? reportsPath(status, type, data.page + 1) : undefined}
            previousHref={data.page > 1 ? reportsPath(status, type, data.page - 1) : undefined}
            summary={`${data.page} / ${data.totalPages}쪽`}
          />
        ) : null}
      </div>
    </AdminPage>
  );
}

function ModAction({ reportId, returnTo, action, label, tone }: { reportId: string; returnTo: string; action: ModerationAction; label: string; tone: "danger" | "neutral" }) {
  return (
    <form action={applyModerationAction}>
      <input name="reportId" type="hidden" value={reportId} />
      <input name="returnTo" type="hidden" value={returnTo} />
      <input name="action" type="hidden" value={action} />
      <AdminButton type="submit" variant={tone === "danger" ? "danger" : "secondary"}>{label}</AdminButton>
    </form>
  );
}
