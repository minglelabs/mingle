import { isSupportedLocale } from "@/i18n";
import { notFound } from "next/navigation";
import type { MyPostsSection } from "@/lib/feed-routes";
import MyPostsScreen from "@/components/compose/my-posts-screen";

const SECTIONS: MyPostsSection[] = ["archived", "trash", "hidden"];

type MyPostsPageProps = {
  params: Promise<{ locale: string; section: string }>;
};

export default async function MyPostsPage({ params }: MyPostsPageProps) {
  const { locale, section } = await params;
  if (!isSupportedLocale(locale)) notFound();
  if (!SECTIONS.includes(section as MyPostsSection)) notFound();

  return (
    <main className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <MyPostsScreen locale={locale} section={section as MyPostsSection} />
    </main>
  );
}
