import MingleHome from "@/components/mingle-home";
import { DEFAULT_LOCALE, getDictionary } from "@/i18n";
import { isAppleOAuthConfigured, isGoogleOAuthConfigured, isNativeAppleAuthConfigured } from "@/lib/auth-options";
import { resolveNativeRuntimePlatformFromSearchParam } from "@/lib/native-runtime-platform";

type PageProps = {
  searchParams: Promise<{
    nativePlatform?: string | string[];
  }>;
};

export default async function Page({ searchParams }: PageProps) {
  const locale = DEFAULT_LOCALE;
  const dictionary = getDictionary(locale);
  const query = await searchParams;

  return (
    <MingleHome
      dictionary={dictionary}
      appleOAuthEnabled={isAppleOAuthConfigured()}
      appleNativeAuthEnabled={isNativeAppleAuthConfigured()}
      googleOAuthEnabled={isGoogleOAuthConfigured()}
      initialNativePlatform={resolveNativeRuntimePlatformFromSearchParam(query.nativePlatform)}
      locale={locale}
    />
  );
}
