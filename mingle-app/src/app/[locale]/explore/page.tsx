import ExplorePeoplePage from "@/components/explore/explore-people-page";
import HomeFeedLayer from "@/components/home/home-feed-layer";
import { FirstRunHomeGuard } from "@/components/feed/posting-feed-route-guard";
import { getDictionary, isSupportedLocale } from "@/i18n";
import { notFound } from "next/navigation";

type ExploreRouteProps = {
  params: Promise<{ locale: string }>;
};

/**
 * The explore tab: people cards, two per row (they were the home tab until
 * 2026-11-23). A new account lands here right after signing up (owner,
 * 2026-11-25: people first, the lounge may be empty), so it carries the same
 * gates and "say something" card as home.
 */
export default async function ExploreRoute({ params }: ExploreRouteProps) {
  const { locale } = await params;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  // Home: a device that owes the first-run speak trial goes to it first.
  return (
    <FirstRunHomeGuard locale={locale} placeholderClassName="bg-white">
      <div className="relative h-full min-h-0 w-full">
        <ExplorePeoplePage dictionary={getDictionary(locale)} locale={locale} />
        <HomeFeedLayer locale={locale} />
      </div>
    </FirstRunHomeGuard>
  );
}
