import { isSupportedLocale, type AppLocale } from "@/i18n";
import { notFound } from "next/navigation";
import SearchPeopleRouteClient from "./search-people-route-client";

type SearchPeopleRouteProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
};

export default async function SearchPeopleRoute({ params, searchParams }: SearchPeopleRouteProps) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const { q } = await searchParams;
  const query = Array.isArray(q) ? (q[0] ?? "") : (q ?? "");

  return <SearchPeopleRouteClient locale={locale as AppLocale} query={query} />;
}
