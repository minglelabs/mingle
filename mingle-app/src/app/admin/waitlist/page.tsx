import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Clock3, DoorOpen, Phone, Undo2 } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sanitizeAdminReturnTo } from "@/lib/admin-return-to";
import { requireAdmin } from "@/server/admin/guard";
import { grantAppAccess, isInviteGateOn, revokeAppAccessGrant } from "@/server/app-access";
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
} from "../_components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "대기열",
};

const PAGE_SIZE = 50;
const VIEWS = ["waiting", "granted"] as const;
type View = (typeof VIEWS)[number];

const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

type WaitlistPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function takeFirst(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

function normalizeView(raw: string): View {
  return VIEWS.includes(raw as View) ? (raw as View) : "waiting";
}

function normalizePage(raw: string): number {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function waitlistPath(view: View, query: string, page: number, result?: string): string {
  const params = new URLSearchParams();
  if (view !== "waiting") params.set("view", view);
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  if (result) params.set("result", result);
  const search = params.toString();
  return search ? `/admin/waitlist?${search}` : "/admin/waitlist";
}

function withResult(returnTo: string, result: string): string {
  return `${returnTo}${returnTo.includes("?") ? "&" : "?"}result=${result}`;
}

function readUserId(formData: FormData): string {
  const value = formData.get("userId");
  return typeof value === "string" ? value.trim() : "";
}

/** Lets a waitlisted account in without an invite; it passes the gate the next time the app asks. */
async function grantAction(formData: FormData) {
  "use server";
  const returnTo = sanitizeAdminReturnTo(formData.get("returnTo"), "/admin/waitlist");
  await requireAdmin(returnTo);
  const userId = readUserId(formData);
  if (!userId) redirect(withResult(returnTo, "missing"));
  await grantAppAccess(userId);
  revalidatePath("/admin/waitlist");
  redirect(withResult(returnTo, "granted"));
}

async function revokeAction(formData: FormData) {
  "use server";
  const returnTo = sanitizeAdminReturnTo(formData.get("returnTo"), "/admin/waitlist?view=granted");
  await requireAdmin(returnTo);
  const userId = readUserId(formData);
  if (!userId) redirect(withResult(returnTo, "missing"));
  await revokeAppAccessGrant(userId);
  revalidatePath("/admin/waitlist");
  redirect(withResult(returnTo, "revoked"));
}

const RESULT_TEXT: Record<string, { tone: "success" | "error"; text: string }> = {
  granted: { tone: "success", text: "입장시켰어요. 앱에서 다시 확인하면 바로 들어가요." },
  revoked: { tone: "success", text: "입장 허용을 취소했어요." },
  missing: { tone: "error", text: "계정을 찾지 못했어요." },
};

/**
 * 대기열: accounts that joined the invite gate's waitlist (each with a
 * verified phone number), oldest first, and the ones an admin already let in.
 * "입장시키기" lets an account in without an invite.
 */
export default async function AdminWaitlistPage({ searchParams }: WaitlistPageProps) {
  const params = await searchParams;
  const view = normalizeView(takeFirst(params.view));
  const query = takeFirst(params.q).trim().slice(0, 64);
  const page = normalizePage(takeFirst(params.page));
  const result = RESULT_TEXT[takeFirst(params.result)];
  const returnTo = waitlistPath(view, query, page);
  await requireAdmin(returnTo);

  const digits = query.replace(/\D/g, "");
  const search: Prisma.UserWhereInput | undefined = query
    ? {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { handle: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        ...(digits.length >= 3 ? [{ phoneE164: { contains: digits } }] : []),
      ],
    }
    : undefined;
  const where: Prisma.UserWhereInput = view === "waiting"
    ? { waitlistedAt: { not: null }, accessGrantedAt: null, referredByUserId: null, isDeleted: false, ...(search ? { AND: [search] } : {}) }
    : { accessGrantedAt: { not: null }, ...(search ? { AND: [search] } : {}) };

  const [total, waitingCount, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count({ where: { waitlistedAt: { not: null }, accessGrantedAt: null, referredByUserId: null, isDeleted: false } }),
    prisma.user.findMany({
      where,
      orderBy: view === "waiting" ? { waitlistedAt: "asc" } : { accessGrantedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, name: true, handle: true, email: true, phoneE164: true,
        createdAt: true, waitlistedAt: true, accessGrantedAt: true,
      },
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminPage>
      <AdminPageHeader
        title="대기열"
        description={`초대 코드 없이 대기 명단에 올린 사람들이에요. 전화번호 인증을 마친 사람만 올라와요. 대기 중 ${waitingCount.toLocaleString("ko-KR")}명.`}
      />
      {!isInviteGateOn() ? (
        <AdminNotice className="mb-3">지금은 초대권 확인(INVITE_GATE)이 꺼져 있어서 누구나 바로 들어와요.</AdminNotice>
      ) : null}
      {result ? <AdminNotice tone={result.tone} className="mb-3">{result.text}</AdminNotice> : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <AdminFilterLink href={waitlistPath("waiting", query, 1)} active={view === "waiting"}>대기 중</AdminFilterLink>
        <AdminFilterLink href={waitlistPath("granted", query, 1)} active={view === "granted"}>입장시킴</AdminFilterLink>
        <form action="/admin/waitlist" className="ml-auto flex min-w-0 flex-1 gap-2 sm:max-w-xs">
          {view !== "waiting" ? <input type="hidden" name="view" value={view} /> : null}
          <input name="q" defaultValue={query} placeholder="이름·핸들·이메일·번호" className={adminInputClassName} />
        </form>
      </div>

      {users.length === 0 ? (
        <AdminEmptyState
          icon={Clock3}
          title={view === "waiting" ? "대기 중인 사람이 없어요" : "입장시킨 사람이 없어요"}
          description={query ? "검색어를 바꿔 보세요." : undefined}
        />
      ) : (
        <ul className="grid gap-2">
          {users.map((user) => (
            <li key={user.id}>
              <AdminCard className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {user.name || "(이름 없음)"}
                    {user.handle ? <span className="ml-1.5 font-normal text-slate-500">@{user.handle}</span> : null}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                    {user.phoneE164 ? (
                      <a href={`tel:${user.phoneE164}`} className="inline-flex items-center gap-1 font-mono text-slate-800 underline-offset-2 hover:underline">
                        <Phone size={12} aria-hidden />
                        {user.phoneE164}
                      </a>
                    ) : <span className="text-slate-400">번호 없음</span>}
                    {user.email ? <span className="truncate">{user.email}</span> : null}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                    <span>가입 {DATE_FORMATTER.format(user.createdAt)}</span>
                    {user.waitlistedAt ? <span>대기 등록 {DATE_FORMATTER.format(user.waitlistedAt)}</span> : null}
                    {user.accessGrantedAt ? <span>입장 {DATE_FORMATTER.format(user.accessGrantedAt)}</span> : null}
                  </p>
                </div>
                {view === "waiting" ? (
                  <form action={grantAction}>
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <AdminButton type="submit" variant="primary">
                      <DoorOpen size={16} aria-hidden />
                      입장시키기
                    </AdminButton>
                  </form>
                ) : (
                  <div className="flex items-center gap-2">
                    <AdminChip tone="success">입장함</AdminChip>
                    <form action={revokeAction}>
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <AdminButton type="submit" variant="ghost">
                        <Undo2 size={16} aria-hidden />
                        취소
                      </AdminButton>
                    </form>
                  </div>
                )}
              </AdminCard>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 ? (
        <div className="mt-3">
          <AdminPagination
            label="대기열 페이지"
            summary={`${page} / ${pageCount}`}
            previousHref={page > 1 ? waitlistPath(view, query, page - 1) : undefined}
            nextHref={page < pageCount ? waitlistPath(view, query, page + 1) : undefined}
          />
        </div>
      ) : null}
    </AdminPage>
  );
}
