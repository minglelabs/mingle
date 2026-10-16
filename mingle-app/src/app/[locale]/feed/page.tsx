import { isSupportedLocale, getDictionary, type AppLocale } from "@/i18n";
import FeedShell from "@/components/feed/feed-shell";
import BottomTabBar from "@/components/bottom-tab-bar";
import PostingFeedRouteGuard from "@/components/feed/posting-feed-route-guard";
import { notFound } from "next/navigation";
import { isAppleOAuthConfigured, isGoogleOAuthConfigured } from "@/lib/auth-options";

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
    <PostingFeedRouteGuard locale={locale}>
      <main className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
        {/* The feed is full-bleed; it renders the glass tab bar over its bottom. */}
        <div className="min-h-0 flex-1">
          <FeedShell
            locale={locale}
            dictionary={dictionary}
            appleOAuthEnabled={isAppleOAuthConfigured()}
            googleOAuthEnabled={isGoogleOAuthConfigured()}
            tabBar={<BottomTabBar activeRoute="feed" dictionary={dictionary} locale={locale} variant="glass" />}
          />
        </div>
      </main>
    </PostingFeedRouteGuard>
  );
}
