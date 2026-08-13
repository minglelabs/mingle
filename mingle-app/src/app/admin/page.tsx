import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  LogOut,
  Mail,
  MessageSquare,
  Send,
  ShieldCheck,
} from "lucide-react";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionToken,
  isAdminAuthConfigured,
  verifyAdminLogin,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";
import {
  ADMIN_FEEDBACK_PAGE_SIZE,
  type AdminFeedbackFilter,
  buildAdminFeedbackHref,
  normalizeAdminFeedbackFilter,
  normalizeAdminFeedbackPage,
  sanitizeAdminFeedbackReturnTo,
} from "@/lib/admin-feedback-query";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mingle Admin",
};

type AdminPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type FeedbackThread = Awaited<ReturnType<typeof loadFeedbackThreads>>["threads"][number];

const FEEDBACK_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
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

async function loginAdminAction(formData: FormData) {
  "use server";

  const username = readFormString(formData.get("username"));
  const password = readFormString(formData.get("password"));
  if (!verifyAdminLogin(username, password)) {
    redirect("/admin?error=invalid_credentials");
  }

  const token = createAdminSessionToken();
  if (!token) {
    redirect("/admin?error=not_configured");
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, token, adminCookieOptions());
  redirect("/admin");
}

async function logoutAdminAction() {
  "use server";

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, "", {
    ...adminCookieOptions(),
    maxAge: 0,
  });
  redirect("/admin");
}

async function createFeedbackReplyAction(formData: FormData) {
  "use server";

  const returnTo = sanitizeAdminFeedbackReturnTo(readFormString(formData.get("returnTo")));
  if (!(await isAdminAuthenticated())) {
    redirect(adminFeedbackPathWithStatus(returnTo, { error: "session_required" }));
  }

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

function categoryClassName(category: string): string {
  switch (category) {
    case "suggestion":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "inquiry":
      return "border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function errorMessage(errorCode: string): string {
  switch (errorCode) {
    case "invalid_credentials":
      return "The username or password is incorrect.";
    case "not_configured":
      return "Admin credentials are not configured.";
    case "session_required":
      return "Please sign in again before replying.";
    case "invalid_reply":
      return "Please enter a reply before sending.";
    case "feedback_not_found":
      return "The feedback item no longer exists.";
    default:
      return "";
  }
}

function renderMetaLabel(thread: FeedbackThread): string {
  const parts = [
    thread.locale,
    thread.clientPlatform,
    thread.appVersion ? `app ${thread.appVersion}` : "",
    thread.apiNamespace,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "No client metadata";
}

function renderShowingLabel(args: {
  filteredCount: number;
  page: number;
  pageSize: number;
  visibleCount: number;
}): string {
  if (args.filteredCount === 0) return "0 of 0";
  const start = (args.page - 1) * args.pageSize + 1;
  const end = start + args.visibleCount - 1;
  return `${start}-${end} of ${args.filteredCount}`;
}

function filterLinkClassName(isActive: boolean): string {
  return [
    "inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition",
    isActive
      ? "border-slate-950 bg-slate-950 text-white"
      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  ].join(" ");
}

function FilterTabs({
  activeFilter,
  totalCount,
  unansweredCount,
}: {
  activeFilter: AdminFeedbackFilter;
  totalCount: number;
  unansweredCount: number;
}) {
  return (
    <nav className="mx-auto flex w-full max-w-6xl flex-wrap gap-2 px-5" aria-label="Feedback filters">
      <Link
        className={filterLinkClassName(activeFilter === "all")}
        href={buildAdminFeedbackHref({ filter: "all" })}
      >
        All feedback
        <span className="text-xs opacity-75">{totalCount}</span>
      </Link>
      <Link
        className={filterLinkClassName(activeFilter === "needs-reply")}
        href={buildAdminFeedbackHref({ filter: "needs-reply" })}
      >
        Needs reply
        <span className="text-xs opacity-75">{unansweredCount}</span>
      </Link>
    </nav>
  );
}

function Pagination({
  filter,
  page,
  totalPages,
}: {
  filter: AdminFeedbackFilter;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  const previousPage = page - 1;
  const nextPage = page + 1;
  const pageLabel = `Page ${page} of ${totalPages}`;
  const buttonClassName = "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50";
  const disabledClassName = "inline-flex h-10 cursor-not-allowed items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-100 px-4 text-sm font-semibold text-slate-400";

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4" aria-label="Feedback pagination">
      {page > 1 ? (
        <Link
          className={buttonClassName}
          href={buildAdminFeedbackHref({ filter, page: previousPage })}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Previous
        </Link>
      ) : (
        <span className={disabledClassName} aria-disabled="true">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Previous
        </span>
      )}
      <span className="text-sm font-medium text-slate-600">{pageLabel}</span>
      {page < totalPages ? (
        <Link
          className={buttonClassName}
          href={buildAdminFeedbackHref({ filter, page: nextPage })}
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : (
        <span className={disabledClassName} aria-disabled="true">
          Next
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}

function LoginView({ error }: { error: string }) {
  return (
    <main className="flex h-svh w-full items-center justify-center overflow-y-auto bg-[#f8fafc] px-5 py-8 text-slate-950">
      <section className="w-full max-w-[26rem] rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-amber-100 text-amber-700">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Mingle Admin</h1>
            <p className="text-sm text-slate-500">Feedback replies</p>
          </div>
        </div>

        {!isAdminAuthConfigured() ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Set MINGLE_ADMIN_USERNAME and MINGLE_ADMIN_PASSWORD before using admin.
          </p>
        ) : null}

        {error ? (
          <p className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <form action={loginAdminAction} className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="admin-username">
              Username
            </label>
            <input
              id="admin-username"
              name="username"
              autoComplete="username"
              className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              required
              type="text"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="admin-password">
              Password
            </label>
            <input
              id="admin-password"
              name="password"
              autoComplete="current-password"
              className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              required
              type="password"
            />
          </div>
          <button
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={!isAdminAuthConfigured()}
            type="submit"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Sign in
          </button>
        </form>
      </section>
    </main>
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
  const authorName = thread.user?.name || thread.user?.email || thread.user?.externalUserId || "Anonymous user";
  const contactEmail = thread.contactEmail || thread.user?.email || "";
  const replyInputId = `reply-${thread.id}`;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${categoryClassName(thread.category)}`}>
              {thread.category}
            </span>
            {teamReplies.length === 0 ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                needs reply
              </span>
            ) : (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                replied
              </span>
            )}
          </div>
          <h2 className="break-words text-base font-semibold text-slate-950">{authorName}</h2>
          <p className="mt-1 break-words text-xs text-slate-500">{renderMetaLabel(thread)}</p>
          {thread.pathname ? (
            <p className="mt-1 break-words text-xs text-slate-400">{thread.pathname}</p>
          ) : null}
        </div>
        <time className="shrink-0 text-sm text-slate-500" dateTime={thread.createdAt.toISOString()}>
          {formatFeedbackDate(thread.createdAt)}
        </time>
      </div>

      {contactEmail ? (
        <a
          className="mb-4 inline-flex max-w-full items-center gap-2 break-all rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
          href={`mailto:${contactEmail}`}
        >
          <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{contactEmail}</span>
        </a>
      ) : null}

      <div className="space-y-3">
        <div className="border-l-2 border-slate-300 py-1 pl-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            User feedback
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{thread.message}</p>
        </div>

        {thread.replies.map((reply) => (
          <div
            className="border-l-2 border-emerald-300 py-1 pl-4"
            key={reply.id}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase text-slate-500">
              <span>{reply.authorType === "team" ? "Team reply" : "User reply"}</span>
              <time dateTime={reply.createdAt.toISOString()}>{formatFeedbackDate(reply.createdAt)}</time>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{reply.message}</p>
          </div>
        ))}
      </div>

      <form action={createFeedbackReplyAction} className="mt-4 space-y-3">
        <input name="feedbackId" type="hidden" value={thread.id} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <label className="block text-sm font-medium text-slate-700" htmlFor={replyInputId}>
          Reply
        </label>
        <textarea
          className="min-h-28 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          id={replyInputId}
          maxLength={4000}
          minLength={2}
          name="message"
          placeholder="Write a response that will appear in the user's feedback history."
          required
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          {wasSent ? (
            <p className="text-sm font-medium text-emerald-700">Reply sent.</p>
          ) : (
            <p className="text-sm text-slate-500">{teamReplies.length} team replies</p>
          )}
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-amber-500 px-4 text-sm font-semibold text-white transition hover:bg-amber-600"
            type="submit"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            Send reply
          </button>
        </div>
      </form>
    </article>
  );
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const error = errorMessage(takeFirst(params.error));
  const sentFeedbackId = takeFirst(params.sent);
  const filter = normalizeAdminFeedbackFilter(takeFirst(params.filter));
  const requestedPage = normalizeAdminFeedbackPage(takeFirst(params.page));

  if (!(await isAdminAuthenticated())) {
    return <LoginView error={error} />;
  }

  const feedback = await loadFeedbackThreads({ filter, page: requestedPage });
  const returnTo = buildAdminFeedbackHref({ filter, page: feedback.page });
  const showingLabel = renderShowingLabel({
    filteredCount: feedback.filteredCount,
    page: feedback.page,
    pageSize: feedback.pageSize,
    visibleCount: feedback.threads.length,
  });

  return (
    <main className="h-svh w-full overflow-y-auto bg-[#f8fafc] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-700">
              <Inbox className="h-4 w-4" aria-hidden="true" />
              Feedback inbox
            </div>
            <h1 className="text-2xl font-semibold text-slate-950">Mingle Admin</h1>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            href="/admin/dashboard"
          >
            대시보드
          </Link>
          <form action={logoutAdminAction}>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              type="submit"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-3 px-5 py-5 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-500">Total feedback</p>
          <p className="mt-2 text-2xl font-semibold">{feedback.totalCount}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-700">Needs reply</p>
          <p className="mt-2 text-2xl font-semibold text-amber-800">{feedback.unansweredCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-500">Showing</p>
          <p className="mt-2 text-2xl font-semibold">{showingLabel}</p>
        </div>
      </section>

      <FilterTabs
        activeFilter={feedback.filter}
        totalCount={feedback.totalCount}
        unansweredCount={feedback.unansweredCount}
      />

      {error ? (
        <section className="mx-auto mt-4 w-full max-w-6xl px-5">
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        </section>
      ) : null}

      {sentFeedbackId ? (
        <section className="mx-auto mt-4 w-full max-w-6xl px-5">
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            Reply sent.
          </p>
        </section>
      ) : null}

      <section className="mx-auto mt-5 w-full max-w-6xl space-y-4 px-5 pb-10">
        {feedback.threads.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
            <Inbox className="mx-auto mb-3 h-8 w-8 text-slate-400" aria-hidden="true" />
            <p className="text-base font-semibold text-slate-800">No feedback yet</p>
            <p className="mt-1 text-sm text-slate-500">New user feedback will appear here.</p>
          </div>
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
        <Pagination
          filter={feedback.filter}
          page={feedback.page}
          totalPages={feedback.totalPages}
        />
      </section>
    </main>
  );
}
