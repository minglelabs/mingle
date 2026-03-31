import MingleHome from "@/components/mingle-home";
import { getDictionary, isSupportedLocale } from "@/i18n";
import { getAuthOptions, isAppleOAuthConfigured, isGoogleOAuthConfigured, isNativeAppleAuthConfigured } from "@/lib/auth-options";
import { resolveNativeRuntimePlatformFromSearchParam } from "@/lib/native-runtime-platform";
import { getUserPreferredLocale } from "@/lib/user-preferred-locale";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

type LocalePageProps = {
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<{
    nativePlatform?: string | string[];
  }>;
};

export default async function LocalePage({ params, searchParams }: LocalePageProps) {
  const { locale } = await params;
  const query = await searchParams;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const session = await getServerSession(getAuthOptions());
  if (session?.user) {
    const preferredLocale = await getUserPreferredLocale(session.user.id);
    redirect(`/${preferredLocale ?? locale}/conversations`);
  }

  return (
    <MingleHome
      dictionary={getDictionary(locale)}
      appleOAuthEnabled={isAppleOAuthConfigured()}
      appleNativeAuthEnabled={isNativeAppleAuthConfigured()}
      googleOAuthEnabled={isGoogleOAuthConfigured()}
      initialNativePlatform={resolveNativeRuntimePlatformFromSearchParam(query.nativePlatform)}
      locale={locale}
    />
  );
}
