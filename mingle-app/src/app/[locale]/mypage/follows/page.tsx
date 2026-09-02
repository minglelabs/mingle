import FollowListScreen, { type FollowListTab } from "@/components/follow-list-screen";
import { getDictionary, isSupportedLocale, type AppLocale } from "@/i18n";
import { notFound } from "next/navigation";

type FollowListPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function resolveTab(value: string | string[] | undefined): FollowListTab {
  return value === "following" ? "following" : "followers";
}

function resolveQuery(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export default async function FollowListPage({ params, searchParams }: FollowListPageProps) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;
  if (!isSupportedLocale(locale)) notFound();

  return (
    <FollowListScreen
      dictionary={getDictionary(locale)}
      locale={locale as AppLocale}
      initialQuery={resolveQuery(resolvedSearchParams.q)}
      initialTab={resolveTab(resolvedSearchParams.tab)}
    />
  );
}
