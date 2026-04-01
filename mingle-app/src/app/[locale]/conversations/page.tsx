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
import {
  findUserIdForIdentity,
  normalizeSessionUserIdentity,
  sanitizeRequestIdentityValue,
} from "@/lib/request-user-identity";
import { getUserPreferredLocale } from "@/lib/user-preferred-locale";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

type ConversationsPageProps = {
  params: Promise<{ locale: string }>;
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

export default async function ConversationsPage({ params, searchParams }: ConversationsPageProps) {
  const { locale } = await params;
  const query = await searchParams;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const session = await getServerSession(getAuthOptions());
  if (session?.user) {
    const preferredLocale = await getUserPreferredLocale(session.user.id);
    if (preferredLocale && preferredLocale !== locale) {
      redirect(buildPathWithSearchParams(`/${preferredLocale}/conversations`, query));
    }
  }

  const cookieStore = await cookies();
  const identity = session?.user
    ? normalizeSessionUserIdentity(session)
    : {
        id: "",
        email: "",
        externalUserId: sanitizeRequestIdentityValue(cookieStore.get("mingle_uid")?.value),
        sessionKey: sanitizeRequestIdentityValue(cookieStore.get("mingle_sid")?.value),
      };
  const userId = await findUserIdForIdentity(identity);
  const conversations = userId
    ? await listConversationChannelsForUser(userId)
    : [];

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
