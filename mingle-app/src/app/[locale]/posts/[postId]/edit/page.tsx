import { isSupportedLocale } from "@/i18n";
import { notFound } from "next/navigation";
import EditPostScreen from "@/components/compose/edit-post-screen";

type EditPostPageProps = {
  params: Promise<{ locale: string; postId: string }>;
};

export default async function EditPostPage({ params }: EditPostPageProps) {
  const { locale, postId } = await params;
  if (!isSupportedLocale(locale)) notFound();
  if (!postId) notFound();

  return (
    <main className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <EditPostScreen locale={locale} postId={decodeURIComponent(postId)} />
    </main>
  );
}
