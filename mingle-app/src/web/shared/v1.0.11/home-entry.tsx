import MingleHomeLegacy from "@/components/mingle-home-legacy";
import { getDictionary } from "@/i18n";
import type { AppLocale } from "@/i18n/config";
import { isAppleOAuthConfigured, isGoogleOAuthConfigured } from "@/lib/auth-options";

type LegacyHomeEntryProps = {
  locale: string;
};

export default function LegacyHomeEntry({ locale }: LegacyHomeEntryProps) {
  return (
    <MingleHomeLegacy
      dictionary={getDictionary(locale as AppLocale)}
      appleOAuthEnabled={isAppleOAuthConfigured()}
      googleOAuthEnabled={isGoogleOAuthConfigured()}
      locale={locale as AppLocale}
    />
  );
}
