import MingleHome from "@/components/mingle-home";
import { getDictionary, isSupportedLocale } from "@/i18n";
import { isAppleOAuthConfigured, isGoogleOAuthConfigured } from "@/lib/auth-options";
import { buildPathWithSearchParams } from "@/lib/build-path-with-search-params";
import {
  resolveDefaultMingleBehaviorProfile,
  readRequestedApiNamespaceFromSearchParams,
  resolveMingleBehaviorProfile,
} from "@/lib/client-behavior-profile";
import { notFound, redirect } from "next/navigation";

type LocalePageProps = {
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LocalePage({ params, searchParams }: LocalePageProps) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const requestedApiNamespace = readRequestedApiNamespaceFromSearchParams(resolvedSearchParams);
  const behaviorProfile = requestedApiNamespace
    ? resolveMingleBehaviorProfile(requestedApiNamespace)
    : resolveDefaultMingleBehaviorProfile();

  if (behaviorProfile === "legacy_1_0_11") {
    return (
      <MingleHome
        dictionary={getDictionary(locale)}
        appleOAuthEnabled={isAppleOAuthConfigured()}
        googleOAuthEnabled={isGoogleOAuthConfigured()}
        locale={locale}
      />
    );
  }

  redirect(buildPathWithSearchParams(`/${locale}/conversations`, resolvedSearchParams));
}
