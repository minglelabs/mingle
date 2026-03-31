import ConversationList from "@/components/conversation-list";
import { getDictionary, isSupportedLocale } from "@/i18n";
import type { AppLocale } from "@/i18n/config";
import { listConversationChannelsForUser } from "@/lib/app-conversations";
import {
  getAuthOptions,
  isAppleWebOAuthConfigured,
  isGoogleOAuthConfigured,
  isNativeAppleAuthConfigured,
} from "@/lib/auth-options";
import { resolveNativeRuntimePlatformFromSearchParam } from "@/lib/native-runtime-platform";
import { getUserPreferredLocale } from "@/lib/user-preferred-locale";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

type ConversationsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    nativePlatform?: string | string[];
  }>;
};

export default async function ConversationsPage({ params, searchParams }: ConversationsPageProps) {
  const { locale } = await params;
  const query = await searchParams;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const session = await getServerSession(getAuthOptions());
  if (!session) {
    redirect(`/${locale}`);
  }

  const preferredLocale = await getUserPreferredLocale(session.user.id);
  if (preferredLocale && preferredLocale !== locale) {
    redirect(`/${preferredLocale}/conversations`);
  }

  const conversations = await listConversationChannelsForUser(session.user.id);

  return (
    <ConversationList
      locale={locale as AppLocale}
      dictionary={getDictionary(locale)}
      initialConversations={conversations}
      translatorConfig={{
        appleWebOAuthEnabled: isAppleWebOAuthConfigured(),
        appleNativeAuthEnabled: isNativeAppleAuthConfigured(),
        googleOAuthEnabled: isGoogleOAuthConfigured(),
        initialNativePlatform: resolveNativeRuntimePlatformFromSearchParam(query.nativePlatform),
      }}
    />
  );
}
