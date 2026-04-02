import { cookies, headers } from "next/headers";
import { getServerSession } from "next-auth";
import ConversationList from "@/components/conversation-list";
import { getDictionary, isSupportedLocale } from "@/i18n";
import type { AppLocale } from "@/i18n/config";
import { listConversationChannelsForUser } from "@/lib/app-conversations";
import { getAuthOptions, isAppleOAuthConfigured, isGoogleOAuthConfigured } from "@/lib/auth-options";
import {
  findUserIdForIdentity,
  normalizeSessionUserIdentity,
  sanitizeRequestIdentityValue,
} from "@/lib/request-user-identity";
import { notFound } from "next/navigation";

type ConversationsPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function ConversationsPage({ params }: ConversationsPageProps) {
  const { locale } = await params;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const session = await getServerSession(getAuthOptions());
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const identity = {
    ...normalizeSessionUserIdentity(session),
    externalUserId: sanitizeRequestIdentityValue(
      requestHeaders.get("x-mingle-user-id")
      || cookieStore.get("mingle_uid")?.value,
    ),
    sessionKey: sanitizeRequestIdentityValue(
      requestHeaders.get("x-mingle-session-key")
      || cookieStore.get("mingle_sid")?.value,
    ),
  };
  const userId = await findUserIdForIdentity(identity);
  const initialConversations = userId
    ? await listConversationChannelsForUser(userId)
    : [];

  return (
    <ConversationList
      locale={locale as AppLocale}
      dictionary={getDictionary(locale)}
      initialConversations={initialConversations}
      appleOAuthEnabled={isAppleOAuthConfigured()}
      googleOAuthEnabled={isGoogleOAuthConfigured()}
    />
  );
}
