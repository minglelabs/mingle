import type { Metadata } from "next";
import Link from "next/link";
import { Clapperboard, ExternalLink, Link2, Plus } from "lucide-react";
import { requireAdmin } from "@/server/admin/guard";
import { listMarketingVideos } from "@/server/marketing-social/posts";
import { SOCIAL_PLATFORM_LABEL, TARGET_STATUS_LABEL } from "@/server/marketing-social/types";
import { AdminButtonLink, AdminCard, AdminChip, AdminEmptyState, AdminPage, AdminPageHeader } from "../_components/ui";
import { formatKst, formatMetrics, STATUS_TONE } from "./_components/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "영상 동시 업로드" };

export default async function AdminSocialPage() {
  await requireAdmin("/admin/social");
  const videos = await listMarketingVideos();

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ href: "/admin/more", label: "더보기" }}
        title="영상 동시 업로드"
        description="마케팅 영상을 인스타그램 릴스·쓰레드·유튜브 쇼츠·틱톡에 한 번에 올리고 성과를 봅니다."
        actions={
          <>
            <AdminButtonLink href="/admin/social/accounts" variant="secondary">
              <Link2 className="h-4 w-4" aria-hidden="true" />
              계정 연결
            </AdminButtonLink>
            <AdminButtonLink href="/admin/social/new" variant="primary">
              <Plus className="h-4 w-4" aria-hidden="true" />
              새 영상
            </AdminButtonLink>
          </>
        }
      />

      {videos.length === 0 ? (
        <AdminEmptyState icon={Clapperboard} title="아직 올린 영상이 없습니다" description="계정을 연결한 뒤 새 영상을 올려 보세요." />
      ) : (
        <ul className="space-y-3">
          {videos.map((video) => (
            <li key={video.id}>
              <AdminCard className="p-0">
                <Link className="block p-4 hover:bg-slate-50" href={`/admin/social/${video.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 break-words font-semibold text-slate-900">{video.title}</p>
                    <span className="shrink-0 text-xs text-slate-500">{formatKst(video.createdAt)}</span>
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {video.targets.map((target) => (
                      <li key={target.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="w-24 shrink-0 text-slate-600">{SOCIAL_PLATFORM_LABEL[target.platform]}</span>
                        <AdminChip tone={STATUS_TONE[target.status]}>{TARGET_STATUS_LABEL[target.status]}</AdminChip>
                        <span className="min-w-0 break-words text-slate-500">{formatMetrics(target.metrics)}</span>
                      </li>
                    ))}
                  </ul>
                </Link>
                {video.targets.some((t) => t.permalink) ? (
                  <div className="flex flex-wrap gap-1 border-t border-slate-100 px-2 py-1">
                    {video.targets.filter((t) => t.permalink).map((target) => (
                      <a
                        key={target.id}
                        className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
                        href={target.permalink!}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {SOCIAL_PLATFORM_LABEL[target.platform]}
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </AdminCard>
            </li>
          ))}
        </ul>
      )}
    </AdminPage>
  );
}
