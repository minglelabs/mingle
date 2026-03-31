import MingleHome from "@/components/mingle-home";
import { getDictionary, isSupportedLocale } from "@/i18n";
import { isAppleOAuthConfigured, isGoogleOAuthConfigured, isNativeAppleAuthConfigured } from "@/lib/auth-options";
import { resolveNativeRuntimePlatformFromSearchParam } from "@/lib/native-runtime-platform";
import { notFound } from "next/navigation";

type TranslatorPageProps = {
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<{
    nativePlatform?: string | string[];
  }>;
};

export default async function TranslatorPage({ params, searchParams }: TranslatorPageProps) {
  const { locale } = await params;
  const query = await searchParams;

  if (!isSupportedLocale(locale)) {
    notFound();
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
