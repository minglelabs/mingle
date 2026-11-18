import type { Metadata } from "next";
import { requireAdmin } from "@/server/admin/guard";
import { connectedPlatforms } from "@/server/marketing-social/accounts";
import { AdminPage, AdminPageHeader } from "../../_components/ui";
import { VideoComposer } from "./video-composer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "새 영상 올리기" };

export default async function AdminSocialNewPage() {
  await requireAdmin("/admin/social/new");
  const connected = await connectedPlatforms();
  return (
    <AdminPage>
      <AdminPageHeader back={{ href: "/admin/social", label: "영상 동시 업로드" }} title="새 영상 올리기" />
      <VideoComposer connected={connected} />
    </AdminPage>
  );
}
