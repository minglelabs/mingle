import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Bell, Bot, ChartLine, Flag, LogOut, MessageCircleHeart, MessagesSquare } from "lucide-react";
import { requireAdmin } from "@/server/admin/guard";
import { logoutAdminAction } from "../_components/session-actions";
import { AdminButton, AdminCard, AdminListLink, AdminPage, AdminPageHeader } from "../_components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "더보기" };

const MORE_LINKS = [
  { href: "/admin", icon: MessageCircleHeart, title: "피드백", description: "앱 사용자가 보낸 의견과 답장" },
  { href: "/admin/reports", icon: Flag, title: "신고함", description: "신고 처리, 숨김과 이용 제한" },
  { href: "/admin/dashboard", icon: ChartLine, title: "대시보드", description: "사용시간, 메시지, DAU, 가입자 추이" },
  { href: "/admin/conversations", icon: MessagesSquare, title: "대화록", description: "외부 사용자 ID로 대화방과 메시지 조회" },
  { href: "/admin/settings/notifications", icon: Bell, title: "알림 설정", description: "인박스 알림을 받을 내 Mingle 계정" },
  { href: "/admin/settings/auto-reply", icon: Bot, title: "AI 자동 답장", description: "N분 안에 답하지 못한 대화에 AI가 답장" },
] as const;

export default async function AdminMorePage() {
  await requireAdmin("/admin/more");

  return (
    <AdminPage>
      <AdminPageHeader title="더보기" />

      <AdminCard className="overflow-hidden p-0">
        <ul className="divide-y divide-slate-100">
          {MORE_LINKS.map((link) => (
            <li key={link.href}>
              <AdminListLink description={link.description} href={link.href} icon={link.icon} title={link.title} />
            </li>
          ))}
        </ul>
      </AdminCard>

      <div className="mt-4 space-y-3">
        <form action={logoutAdminAction}>
          <AdminButton block type="submit">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            로그아웃
          </AdminButton>
        </form>
        <Link
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold text-sky-700 hover:bg-sky-50"
          href="/"
          prefetch={false}
        >
          Mingle 앱으로 돌아가기
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </AdminPage>
  );
}
