import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Inbox, Mail, MessageSquare, Send, ShieldCheck } from "lucide-react";
import { isAdminAuthConfigured } from "@/lib/admin-auth";
import {
  ADMIN_FEEDBACK_PAGE_SIZE,
  type AdminFeedbackFilter,
  buildAdminFeedbackHref,
  normalizeAdminFeedbackFilter,
  normalizeAdminFeedbackPage,
  sanitizeAdminFeedbackReturnTo,
} from "@/lib/admin-feedback-query";
import { sanitizeAdminReturnTo } from "@/lib/admin-return-to";
import { prisma } from "@/lib/prisma";
import { getAdminContext, requireAdmin } from "@/server/admin/guard";
import { loginAdminAction } from "./_components/session-actions";
import {
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
} from "./_components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "피드백",
};

type AdminPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type FeedbackThread = Awaited<ReturnType<typeof loadFeedbackThreads>>["threads"][number];

const FEEDBACK_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

function readFormString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function normalizeReplyMessage(value: FormDataEntryValue | null): string {
  return readFormString(value).trim().slice(0, 4000);
}

function takeFirst(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

function adminFeedbackPathWithStatus(path: string, status: { error?: string; sent?: string }): string {
  const url = new URL(path, "https://mingle.local");
  url.searchParams.delete("error");
  url.searchParams.delete("sent");
  if (status.error) {
    url.searchParams.set("error", status.error);
  }
  if (status.sent) {
    url.searchParams.set("sent", status.sent);
  }
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

async function createFeedbackReplyAction(formData: FormData) {
  "use server";

  const returnTo = sanitizeAdminFeedbackReturnTo(readFormString(formData.get("returnTo")));
  await requireAdmin(returnTo);

  const feedbackId = readFormString(formData.get("feedbackId")).trim();
  const message = normalizeReplyMessage(formData.get("message"));
  if (!feedbackId || message.length < 2) {
    redirect(adminFeedbackPathWithStatus(returnTo, { error: "invalid_reply" }));
  }

  const feedback = await prisma.appFeedback.findUnique({
    where: { id: feedbackId },
    select: { id: true },
  });
  if (!feedback) {
    redirect(adminFeedbackPathWithStatus(returnTo, { error: "feedback_not_found" }));
  }

  await prisma.appFeedbackReply.create({
    data: {
      feedbackId,
      authorType: "team",
      message,
    },
  });

  revalidatePath("/admin");
  redirect(adminFeedbackPathWithStatus(returnTo, { sent: feedbackId }));
}

function needsReplyWhere(): Prisma.AppFeedbackWhereInput {
  return {
    replies: {
      none: {
        authorType: "team",
      },
    },
  };
}

function feedbackWhereForFilter(filter: AdminFeedbackFilter): Prisma.AppFeedbackWhereInput {
  return filter === "needs-reply" ? needsReplyWhere() : {};
}

async function loadFeedbackThreads(args: { filter: AdminFeedbackFilter; page: number }) {
  const where = feedbackWhereForFilter(args.filter);
  const [totalCount, unansweredCount, filteredCount] = await prisma.$transaction([
    prisma.appFeedback.count(),
    prisma.appFeedback.count({ where: needsReplyWhere() }),
    prisma.appFeedback.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(filteredCount / ADMIN_FEEDBACK_PAGE_SIZE));
  const page = Math.min(args.page, totalPages);
  const skip = (page - 1) * ADMIN_FEEDBACK_PAGE_SIZE;
  const threads = filteredCount === 0
    ? []
    : await prisma.appFeedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: ADMIN_FEEDBACK_PAGE_SIZE,
      select: {
        id: true,
        category: true,
        message: true,
        contactEmail: true,
        locale: true,
        clientPlatform: true,
        appVersion: true,
        apiNamespace: true,
        pathname: true,
        createdAt: true,
        user: {
          select: {
            email: true,
            name: true,
            externalUserId: true,
          },
        },
        replies: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            authorType: true,
            message: true,
            createdAt: true,
          },
        },
      },
    });

  return {
    threads,
    totalCount,
    unansweredCount,
    filteredCount,
    filter: args.filter,
    page,
    totalPages,
    pageSize: ADMIN_FEEDBACK_PAGE_SIZE,
  };
}

function formatFeedbackDate(value: Date): string {
  return FEEDBACK_DATE_FORMATTER.format(value);
}

function categoryLabel(category: string): string {
  switch (category) {
    case "suggestion":
      return "제안";
    case "inquiry":
      return "문의";
    case "feedback":
      return "의견";
    default:
      return category;
  }
}

function loginErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case "invalid_credentials":
      return "아이디 또는 비밀번호가 올바르지 않습니다.";
    case "too_many_attempts":
      return "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.";
    case "not_configured":
      return "관리자 계정이 설정되지 않았습니다.";
    default:
      return "";
  }
}

function feedbackErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case "invalid_reply":
      return "답장을 2자 이상 입력하세요.";
    case "feedback_not_found":
      return "이 피드백은 더 이상 없습니다.";
    default:
      return "";
  }
}

function renderMetaLabel(thread: FeedbackThread): string {
  const parts = [
    thread.locale,
    thread.clientPlatform,
    thread.appVersion ? `앱 ${thread.appVersion}` : "",
    thread.apiNamespace,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "클라이언트 정보 없음";
}

function renderShowingLabel(args: {
  filteredCount: number;
  page: number;
  pageSize: number;
  visibleCount: number;
}): string {
  if (args.filteredCount === 0) return "0개";
  const start = (args.page - 1) * args.pageSize + 1;
  const end = start + args.visibleCount - 1;
  return `${start}–${end} / ${args.filteredCount}개`;
}

/**
 * Full-screen on purpose: after a session expires mid-visit the admin layout
 * (and its tab bar) is not re-rendered, so the login view covers it.
 */
function LoginView({ error, next }: { error: string; next: string }) {
  const configured = isAdminAuthConfigured();
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-50 px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-slate-900">
      <div className="flex min-h-full items-center justify-center">
        <section className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">Mingle Admin</h1>
              <p className="text-sm text-slate-500">운영 도구 로그인</p>
            </div>
          </div>

          <div className="space-y-3">
            {!configured ? (
              <AdminNotice tone="error">
                MINGLE_ADMIN_USERNAME과 MINGLE_ADMIN_PASSWORD를 설정해야 로그인할 수 있습니다.
              </AdminNotice>
            ) : null}
            {error ? <AdminNotice tone="error">{error}</AdminNotice> : null}
            {next && next !== "/admin" ? (
              <p className="text-sm leading-6 text-slate-500">로그인하면 보던 화면으로 돌아갑니다.</p>
            ) : null}
          </div>

          <form action={loginAdminAction} className="mt-5 space-y-4">
            {next ? <input name="next" type="hidden" value={next} /> : null}
            <div>
              <label className={adminLabelClassName} htmlFor="admin-username">
                아이디
              </label>
              <input
                autoCapitalize="none"
                autoComplete="username"
                autoCorrect="off"
                className={adminInputClassName}
                id="admin-username"
                name="username"
                required
                spellCheck={false}
                type="text"
              />
            </div>
            <div>
              <label className={adminLabelClassName} htmlFor="admin-password">
                비밀번호
              </label>
              <input
                autoComplete="current-password"
                className={adminInputClassName}
                id="admin-password"
                name="password"
                required
                type="password"
              />
            </div>
            <AdminButton block disabled={!configured} type="submit" variant="primary">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              로그인
            </AdminButton>
          </form>
        </section>
      </div>
    </div>
  );
}

function FeedbackCard({
  thread,
  returnTo,
  wasSent,
}: {
  thread: FeedbackThread;
  returnTo: string;
  wasSent: boolean;
}) {
  const teamReplies = thread.replies.filter((reply) => reply.authorType === "team");
  const authorName = thread.user?.name || thread.user?.email || thread.user?.externalUserId || "익명 사용자";
  const contactEmail = thread.contactEmail || thread.user?.email || "";
  const replyInputId = `reply-${thread.id}`;

  return (
    <AdminCard as="article">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <AdminChip>{categoryLabel(thread.category)}</AdminChip>
        {teamReplies.length === 0 ? (
          <AdminChip tone="warning">답장 필요</AdminChip>
        ) : (
          <AdminChip tone="success">답장 완료</AdminChip>
        )}
        <time className="ml-auto text-xs text-slate-500" dateTime={thread.createdAt.toISOString()}>
          {formatFeedbackDate(thread.createdAt)}
        </time>
      </div>
      <h2 className="break-words text-base font-semibold text-slate-900">{authorName}</h2>
      <p className="mt-1 break-words text-xs text-slate-500">{renderMetaLabel(thread)}</p>
      {thread.pathname ? <p className="mt-1 break-all text-xs text-slate-400">{thread.pathname}</p> : null}

      {contactEmail ? (
        <a
          className="mt-3 inline-flex min-h-11 max-w-full items-center gap-2 break-all rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 transition hover:bg-slate-100"
          href={`mailto:${contactEmail}`}
        >
          <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{contactEmail}</span>
        </a>
      ) : null}

      <div className="mt-4 space-y-3">
        <div className="border-l-2 border-slate-300 py-1 pl-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            사용자 의견
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{thread.message}</p>
        </div>

        {thread.replies.map((reply) => (
          <div className="border-l-2 border-sky-300 py-1 pl-3" key={reply.id}>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
              <span>{reply.authorType === "team" ? "팀 답장" : "사용자 답장"}</span>
              <time dateTime={reply.createdAt.toISOString()}>{formatFeedbackDate(reply.createdAt)}</time>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{reply.message}</p>
          </div>
        ))}
      </div>

      <form action={createFeedbackReplyAction} className="mt-4 space-y-2">
        <input name="feedbackId" type="hidden" value={thread.id} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <label className={adminLabelClassName} htmlFor={replyInputId}>
          답장
        </label>
        <textarea
          className={adminTextareaClassName}
          id={replyInputId}
          maxLength={4000}
          minLength={2}
          name="message"
          placeholder="사용자의 피드백 기록에 표시될 답장을 쓰세요."
          required
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          {wasSent ? (
            <p className="text-sm font-medium text-emerald-700">답장을 보냈습니다.</p>
          ) : (
            <p className="text-sm text-slate-500">팀 답장 {teamReplies.length}개</p>
          )}
          <AdminButton type="submit" variant="primary">
            <Send className="h-4 w-4" aria-hidden="true" />
            답장 보내기
          </AdminButton>
        </div>
      </form>
    </AdminCard>
  );
}

export default async function AdminFeedbackPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const errorCode = takeFirst(params.error);

  // `/admin` doubles as the login page, so it checks the session instead of redirecting.
  if (!(await getAdminContext())) {
    return (
      <LoginView
        error={loginErrorMessage(errorCode)}
        next={sanitizeAdminReturnTo(takeFirst(params.next), "")}
      />
    );
  }

  const error = feedbackErrorMessage(errorCode);
  const sentFeedbackId = takeFirst(params.sent);
  const filter = normalizeAdminFeedbackFilter(takeFirst(params.filter));
  const requestedPage = normalizeAdminFeedbackPage(takeFirst(params.page));
  const feedback = await loadFeedbackThreads({ filter, page: requestedPage });
  const returnTo = buildAdminFeedbackHref({ filter, page: feedback.page });
  const showingLabel = renderShowingLabel({
    filteredCount: feedback.filteredCount,
    page: feedback.page,
    pageSize: feedback.pageSize,
    visibleCount: feedback.threads.length,
  });

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ href: "/admin/more", label: "더보기" }}
        description="앱 사용자가 보낸 의견입니다. 답장은 사용자의 피드백 기록에 표시됩니다."
        title="피드백"
      />

      <nav aria-label="피드백 필터" className="flex flex-wrap gap-2">
        <AdminFilterLink active={feedback.filter === "all"} href={buildAdminFeedbackHref({ filter: "all" })}>
          전체
          <span className="text-xs opacity-80">{feedback.totalCount}</span>
        </AdminFilterLink>
        <AdminFilterLink active={feedback.filter === "needs-reply"} href={buildAdminFeedbackHref({ filter: "needs-reply" })}>
          답장 필요
          <span className="text-xs opacity-80">{feedback.unansweredCount}</span>
        </AdminFilterLink>
      </nav>
      <p className="mt-2 text-xs text-slate-500">{showingLabel} 표시</p>

      <div className="mt-3 space-y-2">
        {error ? <AdminNotice tone="error">{error}</AdminNotice> : null}
        {sentFeedbackId ? <AdminNotice tone="success">답장을 보냈습니다.</AdminNotice> : null}
      </div>

      <div className="mt-3 space-y-3">
        {feedback.threads.length === 0 ? (
          <AdminEmptyState
            description={feedback.filter === "needs-reply" ? "모든 피드백에 답장했습니다." : "새 의견이 오면 여기에 표시됩니다."}
            icon={Inbox}
            title={feedback.filter === "needs-reply" ? "답장할 피드백이 없습니다" : "아직 피드백이 없습니다"}
          />
        ) : (
          feedback.threads.map((thread) => (
            <FeedbackCard
              key={thread.id}
              returnTo={returnTo}
              thread={thread}
              wasSent={sentFeedbackId === thread.id}
            />
          ))
        )}
        {feedback.totalPages > 1 ? (
          <AdminPagination
            label="피드백 페이지"
            nextHref={feedback.page < feedback.totalPages ? buildAdminFeedbackHref({ filter: feedback.filter, page: feedback.page + 1 }) : undefined}
            previousHref={feedback.page > 1 ? buildAdminFeedbackHref({ filter: feedback.filter, page: feedback.page - 1 }) : undefined}
            summary={`${feedback.page} / ${feedback.totalPages}쪽`}
          />
        ) : null}
      </div>
    </AdminPage>
  );
}
