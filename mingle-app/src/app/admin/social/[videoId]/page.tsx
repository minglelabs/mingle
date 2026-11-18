import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/admin/guard";
import { getMarketingVideo } from "@/server/marketing-social/posts";
import { AdminPage, AdminPageHeader } from "../../_components/ui";
import { VideoDetail } from "./video-detail";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "영상 게시 결과" };

export default async function AdminSocialVideoPage({ params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await params;
  await requireAdmin(`/admin/social/${videoId}`);
  const video = await getMarketingVideo(videoId);
  if (!video) notFound();
  return (
    <AdminPage>
      <AdminPageHeader back={{ href: "/admin/social", label: "영상 동시 업로드" }} title={video.title} />
      <VideoDetail initial={video} />
    </AdminPage>
  );
}
