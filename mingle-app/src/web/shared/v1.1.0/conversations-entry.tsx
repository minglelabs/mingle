import { cookies, headers } from "next/headers";
import { getServerSession } from "next-auth";
import ConversationList from "@/components/conversation-list";
import {
  listConversationChannelsForUser,
  type ConversationChannelSummary,
} from "@/lib/app-conversations";
import { getUserProfile } from "@/server/user-profile";
import { getDictionary } from "@/i18n";
import type { AppLocale } from "@/i18n/config";
import {
  getAuthOptions,
  isAppleOAuthConfigured,
  isGoogleOAuthConfigured,
} from "@/lib/auth-options";
import {
  findUserIdForIdentity,
  normalizeSessionUserIdentity,
  sanitizeRequestIdentityValue,
} from "@/lib/request-user-identity";

type V110ConversationsEntryProps = {
  locale: string;
  searchParams: Record<string, string | string[] | undefined>;
};

function readSearchParamValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const rawValue = searchParams[key];
  if (typeof rawValue === "string") return rawValue;
  if (Array.isArray(rawValue)) return rawValue[0] ?? "";
  return "";
}

function parseNativeInsetPx(rawValue: string): number {
  const numericValue = Number.parseInt(rawValue, 10);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}

export default async function V110ConversationsEntry({
  locale,
  searchParams,
}: V110ConversationsEntryProps) {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const initialNativeUi = readSearchParamValue(searchParams, "nativeUi") === "1";
  const initialConversationId = readSearchParamValue(searchParams, "conversation");
  const isExplicitNativeTabRoot = initialNativeUi
    && readSearchParamValue(searchParams, "nativeTabRoot") === "1"
    && !initialConversationId;
  // TEMP DEBUG — remove once the add-members return-flash is confirmed
  // fixed or its real cause is found. Every hit to this server component
  // prints here (devbox terminal), so we can tell, with the phone as the
  // client, whether a server round trip happens at all on the way back from
  // add-members, and with what params — ground truth Safari Web Inspector
  // hasn't been able to give us.
  console.log("[conversations-entry DEBUG]", {
    conversation: initialConversationId || null,
    nativeTabRoot: readSearchParamValue(searchParams, "nativeTabRoot"),
    nativeUi: readSearchParamValue(searchParams, "nativeUi"),
    isExplicitNativeTabRoot,
    at: new Date().toISOString(),
  });
  // Native tab navigation must be able to commit the list route before the
  // Railway database round-trip finishes. The client list performs one
  // identity-aware refresh after mount, so doing the same user lookup and
  // channel query here would only make the tab switch wait twice.
  const session = isExplicitNativeTabRoot ? null : await getServerSession(getAuthOptions());
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
  let initialConversations: ConversationChannelSummary[] = [];
  let initialPrimaryLanguage: string | null = null;
  let initialPrimaryLanguages: string[] = [];
  let initialDefaultConversationLanguages: string[] = [];
  if (!isExplicitNativeTabRoot) {
    const userId = await findUserIdForIdentity(identity);
    if (userId) {
      const [nextConversations, profile] = await Promise.all([
        listConversationChannelsForUser(userId, {
          includeMessageSummaries: true,
        }),
        getUserProfile(userId),
      ]);
      initialConversations = nextConversations;
      initialPrimaryLanguage = profile?.nationality ?? null;
      initialPrimaryLanguages = profile?.primaryLanguages ?? [];
      initialDefaultConversationLanguages = profile?.defaultConversationLanguages ?? [];
    }
  }

  return (
    <ConversationList
      locale={locale as AppLocale}
      dictionary={getDictionary(locale as AppLocale)}
      initialConversations={initialConversations}
      initialConversationsRequireRefresh={isExplicitNativeTabRoot}
      initialConversationIdToOpen={initialConversationId || null}
      initialPrimaryLanguage={initialPrimaryLanguage}
      initialPrimaryLanguages={initialPrimaryLanguages}
      initialDefaultConversationLanguages={initialDefaultConversationLanguages}
      initialNativeUi={initialNativeUi}
      initialNativeBannerPosition={readSearchParamValue(searchParams, "nativeBannerPosition")}
      initialNativeTopInsetPx={parseNativeInsetPx(readSearchParamValue(searchParams, "nativeTopInsetPx"))}
      initialNativeBottomInsetPx={parseNativeInsetPx(readSearchParamValue(searchParams, "nativeBottomInsetPx"))}
      initialNativeListTopInsetPx={parseNativeInsetPx(readSearchParamValue(searchParams, "nativeListTopInsetPx"))}
      initialNativeConversationBannerPosition={readSearchParamValue(searchParams, "nativeConversationBannerPosition")}
      initialNativeConversationBottomInsetPx={parseNativeInsetPx(readSearchParamValue(searchParams, "nativeConversationBottomInsetPx"))}
      initialTrackingExternalUserId={identity.externalUserId}
      initialTrackingSessionKey={identity.sessionKey}
      appleOAuthEnabled={isAppleOAuthConfigured()}
      googleOAuthEnabled={isGoogleOAuthConfigured()}
    />
  );
}
