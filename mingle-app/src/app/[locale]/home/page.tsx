import { buildPathWithSearchParams } from "@/lib/build-path-with-search-params";
import { exploreHref, homeHref } from "@/lib/home-routes";
import { isSupportedLocale } from "@/i18n";
import { notFound, redirect } from "next/navigation";

type HomeRouteProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Old address of the people cards. Home is the feed again (2026-11-23) and the
 * cards are on the explore tab: an old link with `?notices=1` (the notice push)
 * opens the explore tab, where the notice strip is now; anything else, the feed.
 */
export default async function HomeRoute({ params, searchParams }: HomeRouteProps) {
  const { locale } = await params;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const query = await searchParams;
  const target = query.notices === "1" ? exploreHref(locale) : homeHref(locale);
  redirect(buildPathWithSearchParams(target, query));
}
