import { isSupportedLocale, getDictionary, type AppLocale } from "@/i18n";
import FeedShell from "@/components/feed/feed-shell";
import BottomTabBar from "@/components/bottom-tab-bar";
import { notFound } from "next/navigation";

type FeedPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function FeedPage({ params }: FeedPageProps) {
  const { locale } = await params;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const dictionary = getDictionary(locale as AppLocale);

  return (
    <main className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        <FeedShell dictionary={dictionary} locale={locale} />
      </div>
      <BottomTabBar
        activeRoute="feed"
        dictionary={dictionary}
        locale={locale}
      />
    </main>
  );
}
