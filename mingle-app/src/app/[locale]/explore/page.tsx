import ExplorePeoplePage from "@/components/explore/explore-people-page";
import { getDictionary, isSupportedLocale } from "@/i18n";
import { notFound } from "next/navigation";

type ExploreRouteProps = {
  params: Promise<{ locale: string }>;
};

/** The explore tab: people cards, two per row (they were the home tab until 2026-11-23). */
export default async function ExploreRoute({ params }: ExploreRouteProps) {
  const { locale } = await params;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  return <ExplorePeoplePage dictionary={getDictionary(locale)} locale={locale} />;
}
