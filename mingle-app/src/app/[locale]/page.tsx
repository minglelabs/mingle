import { isSupportedLocale } from "@/i18n";
import { buildPathWithSearchParams } from "@/lib/build-path-with-search-params";
import { notFound, redirect } from "next/navigation";

type LocalePageProps = {
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LocalePage({ params, searchParams }: LocalePageProps) {
  const { locale } = await params;
  const query = await searchParams;

  if (!isSupportedLocale(locale)) {
    notFound();
  }
  redirect(buildPathWithSearchParams(`/${locale}/conversations`, query));
}
