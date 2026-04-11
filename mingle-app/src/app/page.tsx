import MingleHome from "@/components/mingle-home";
import { DEFAULT_LOCALE, getDictionary } from "@/i18n";
import { isGoogleOAuthConfigured } from "@/lib/auth-options";
import {
  resolveDefaultMingleClientReleaseVariant,
  supportsConversationRoomsForReleaseVariant,
} from "@/lib/client-behavior-profile";
import { redirect } from "next/navigation";

export default function Page() {
  const locale = DEFAULT_LOCALE;
  const dictionary = getDictionary(locale);
  const releaseVariant = resolveDefaultMingleClientReleaseVariant();

  if (supportsConversationRoomsForReleaseVariant(releaseVariant)) {
    redirect(`/${locale}/conversations`);
  }

  return (
    <MingleHome
      clientReleaseVariant={releaseVariant}
      dictionary={dictionary}
      // appleOAuthEnabled={isAppleOAuthConfigured()}
      appleOAuthEnabled={false}
      googleOAuthEnabled={isGoogleOAuthConfigured()}
      locale={locale}
    />
  );
}
