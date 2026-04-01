import { isSupportedLocale } from "@/i18n";
import { notFound, redirect } from "next/navigation";

type TranslatorPageProps = {
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function buildPathWithSearchParams(
  pathname: string,
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const nextSearchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        nextSearchParams.append(key, entry);
      }
      continue;
    }
    if (typeof value === "string") {
      nextSearchParams.set(key, value);
    }
  }
  const nextSearch = nextSearchParams.toString();
  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
}

export default async function TranslatorPage({ params, searchParams }: TranslatorPageProps) {
  const { locale } = await params;
  const query = await searchParams;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  redirect(buildPathWithSearchParams(`/${locale}/conversations`, query));
}
