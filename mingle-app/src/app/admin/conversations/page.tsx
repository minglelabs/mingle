import type { Metadata } from "next";
import { requireAdmin } from "@/server/admin/guard";
import { AdminPage, AdminPageHeader } from "../_components/ui";
import { AdminConversationLookupForm } from "./admin-conversation-lookup-form";
import { AdminConversationBrowser, type AdminConversationBrowserProps } from "./admin-conversations-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "대화록" };

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

function conversationsPath(userId: string): string {
  return userId ? `/admin/conversations?${new URLSearchParams({ userId }).toString()}` : "/admin/conversations";
}

export default async function AdminConversationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const userId = first(params.userId);
  await requireAdmin(conversationsPath(userId));

  const legacyDeleted = normalizeDeletedFilter(first(params.deleted), "all");
  const browserProps: AdminConversationBrowserProps = {
    userId,
    channelDeleted: normalizeDeletedFilter(first(params.channelDeleted), legacyDeleted),
    messageDeleted: normalizeDeletedFilter(first(params.messageDeleted), "all"),
    sort: normalizeSort(first(params.sort)),
    page: normalizePage(first(params.page)),
    channelId: first(params.channelId),
  };

  return (
    <AdminPage wide>
      <AdminPageHeader
        back={{ href: "/admin/more", label: "더보기" }}
        description="외부 사용자 ID로 그 사용자가 만든 대화방과 보낸 메시지를 확인합니다."
        title="대화록"
      />

      <AdminConversationLookupForm defaultUserId={browserProps.userId} />

      <AdminConversationBrowser {...browserProps} />
    </AdminPage>
  );
}
