import type { Metadata } from "next";
import Link from "next/link";
import { Ban, Search } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/server/admin/guard";
import { AdminCard, AdminChip, AdminEmptyState, AdminFilterLink, AdminPage, AdminPageHeader, adminInputClassName } from "../_components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "계정·퇴출" };

const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function takeFirst(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

/**
 * 계정·퇴출: find an account by name, handle, e-mail, number or id, then open
 * it to see its sign-in methods, devices and linked accounts, and to ban it
 * permanently (docs/one-account-per-person.md).
 */
export default async function AdminAccountsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = takeFirst(params.q).trim().slice(0, 64);
  const view = takeFirst(params.view) === "banned" ? "banned" : "search";
  await requireAdmin(view === "banned" ? "/admin/accounts?view=banned" : "/admin/accounts");

  const digits = query.replace(/\D/g, "");
  const where: Prisma.UserWhereInput | null = view === "banned"
    ? { bannedAt: { not: null } }
    : query
      ? {
        OR: [
          { id: query },
          { name: { contains: query, mode: "insensitive" } },
          { handle: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          ...(digits.length >= 3 ? [{ phoneE164: { contains: digits } }] : []),
        ],
      }
      : null;
  const users = where
    ? await prisma.user.findMany({
      where,
      orderBy: view === "banned" ? { bannedAt: "desc" } : { createdAt: "desc" },
      take: 50,
      select: { id: true, name: true, handle: true, email: true, phoneE164: true, createdAt: true, bannedAt: true, isDeleted: true, mergedIntoUserId: true },
    })
    : [];

  return (
    <AdminPage>
      <AdminPageHeader
        title="계정·퇴출"
        description="계정을 찾아 로그인 수단·기기·이어진 계정을 보고, 영구 퇴출할 수 있어요."
        back={{ href: "/admin/more", label: "더보기" }}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <AdminFilterLink href="/admin/accounts" active={view === "search"}>찾기</AdminFilterLink>
        <AdminFilterLink href="/admin/accounts?view=banned" active={view === "banned"}>퇴출된 계정</AdminFilterLink>
        {view === "search" ? (
          <form action="/admin/accounts" className="ml-auto flex min-w-0 flex-1 gap-2 sm:max-w-xs">
            <input name="q" defaultValue={query} placeholder="이름·핸들·이메일·번호·ID" className={adminInputClassName} />
          </form>
        ) : null}
      </div>

      {users.length === 0 ? (
        <AdminEmptyState
          icon={view === "banned" ? Ban : Search}
          title={view === "banned" ? "퇴출된 계정이 없어요" : query ? "찾은 계정이 없어요" : "찾을 계정을 입력해 주세요"}
        />
      ) : (
        <ul className="grid gap-2">
          {users.map((user) => (
            <li key={user.id}>
              <Link href={`/admin/accounts/${encodeURIComponent(user.id)}`} className="block">
                <AdminCard className="hover:border-sky-300">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className="truncate">{user.name || "(이름 없음)"}</span>
                    {user.handle ? <span className="font-normal text-slate-500">@{user.handle}</span> : null}
                    {user.bannedAt ? <AdminChip tone="danger" icon={Ban}>영구 퇴출</AdminChip> : null}
                    {user.mergedIntoUserId ? <AdminChip>다른 계정으로 합쳐짐</AdminChip> : user.isDeleted ? <AdminChip>탈퇴</AdminChip> : null}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                    <span className="font-mono">{user.phoneE164 ?? "번호 없음"}</span>
                    {user.email ? <span className="truncate">{user.email}</span> : null}
                    <span>가입 {DATE_FORMATTER.format(user.createdAt)}</span>
                    {user.bannedAt ? <span>퇴출 {DATE_FORMATTER.format(user.bannedAt)}</span> : null}
                  </p>
                </AdminCard>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminPage>
  );
}
