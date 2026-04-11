import MingleHomeLegacy from "@/components/mingle-home-legacy";
import { getDictionary, isSupportedLocale } from "@/i18n";
import { isAppleOAuthConfigured, isGoogleOAuthConfigured } from "@/lib/auth-options";
import { buildPathWithSearchParams } from "@/lib/build-path-with-search-params";
import {
  resolveDefaultMingleClientReleaseVariant,
  readRequestedApiNamespaceFromSearchParams,
  resolveMingleClientReleaseVariant,
} from "@/lib/client-behavior-profile";
import { notFound, redirect } from "next/navigation";

type TranslatorPageProps = {
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TranslatorPage({ params, searchParams }: TranslatorPageProps) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const requestedApiNamespace = readRequestedApiNamespaceFromSearchParams(resolvedSearchParams);
  const releaseVariant = requestedApiNamespace
    ? resolveMingleClientReleaseVariant(requestedApiNamespace)
    : resolveDefaultMingleClientReleaseVariant();

  switch (releaseVariant) {
    case "legacy_default_v1_0_11":
    case "ios_v1_0_11":
    case "android_v1_0_11":
      return (
        <MingleHomeLegacy
          dictionary={getDictionary(locale)}
          appleOAuthEnabled={isAppleOAuthConfigured()}
          googleOAuthEnabled={isGoogleOAuthConfigured()}
          locale={locale}
        />
      );
    case "ios_v1_1_0":
    case "android_v1_1_0":
      redirect(buildPathWithSearchParams(`/${locale}/conversations`, resolvedSearchParams));
  }
}
