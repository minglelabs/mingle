import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-auth";
import { AdminConversationBrowser, type AdminConversationBrowserProps } from "./admin-conversations-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Mingle Admin Conversations" };

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type DeletedFilter = "all" | "active" | "deleted";
type ChannelSort = "updated-desc" | "updated-asc" | "created-desc" | "created-asc" | "latest-message-desc" | "title-asc" | "title-desc";

function first(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : Array.isArray(value) ? (value[0] ?? "").trim() : "";
}

function normalizePage(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100_000) : 1;
}

function normalizeDeletedFilter(value: string, fallback: DeletedFilter = "all"): DeletedFilter {
  return value === "active" || value === "deleted" || value === "all" ? value : fallback;
}

function normalizeSort(value: string): ChannelSort {
  return value === "updated-asc" || value === "created-desc" || value === "created-asc" || value === "latest-message-desc" || value === "title-asc" || value === "title-desc" ? value : "updated-desc";
}

async function authenticated(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminSessionToken(store.get(ADMIN_SESSION_COOKIE_NAME)?.value);
}

export default async function AdminConversationsPage({ searchParams }: PageProps) {
  if (!(await authenticated())) redirect("/admin");

  const params = await searchParams;
  const legacyDeleted = normalizeDeletedFilter(first(params.deleted), "all");
  const browserProps: AdminConversationBrowserProps = {
    userId: first(params.userId),
    channelDeleted: normalizeDeletedFilter(first(params.channelDeleted), legacyDeleted),
    messageDeleted: normalizeDeletedFilter(first(params.messageDeleted), "all"),
    sort: normalizeSort(first(params.sort)),
    page: normalizePage(first(params.page)),
    channelId: first(params.channelId),
  };

  return (
    <main id="admin-conversations-scroll" className="h-svh w-full overflow-y-auto overscroll-contain bg-[#f9f9f7] px-4 py-6 text-[#0b0b0b]">
      <div className="mx-auto max-w-6xl pb-10">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-2xl font-semibold">대화록 조회</h1><p className="mt-1 text-sm text-[#6f6d68]">외부 사용자 ID로 저장된 대화방과 메시지를 확인합니다.</p></div>
          <Link className="rounded-md border border-[#e5e3dc] bg-white px-4 py-2 text-sm font-semibold" href="/admin">피드백함으로</Link>
        </header>

        <form className="mb-4 flex gap-2 rounded-xl border border-[#e5e3dc] bg-white p-4 shadow-sm" method="get">
          <input name="userId" defaultValue={browserProps.userId} placeholder="external user ID" className="min-w-0 flex-1 rounded-md border border-[#d9d6ce] px-3 py-2 text-sm" required />
          <button className="rounded-md bg-[#0b0b0b] px-4 py-2 text-sm font-semibold text-white" type="submit">조회</button>
        </form>

        <AdminConversationBrowser {...browserProps} />
      </div>
    </main>
  );
}
