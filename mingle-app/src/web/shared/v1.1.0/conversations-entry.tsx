import { cookies, headers } from "next/headers";
import { getServerSession } from "next-auth";
import ConversationList from "@/components/conversation-list";
import { getDictionary } from "@/i18n";
import type { AppLocale } from "@/i18n/config";
import { listConversationChannelsForUser } from "@/lib/app-conversations";
import { getAuthOptions, isGoogleOAuthConfigured } from "@/lib/auth-options";
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
      dictionary={getDictionary(locale as AppLocale)}
      initialConversations={initialConversations}
      initialConversationIdToOpen={readSearchParamValue(searchParams, "conversation") || null}
      initialNativeUi={readSearchParamValue(searchParams, "nativeUi") === "1"}
      initialNativeBannerPosition={readSearchParamValue(searchParams, "nativeBannerPosition")}
      initialNativeTopInsetPx={parseNativeInsetPx(readSearchParamValue(searchParams, "nativeTopInsetPx"))}
      initialNativeBottomInsetPx={parseNativeInsetPx(readSearchParamValue(searchParams, "nativeBottomInsetPx"))}
      initialNativeListTopInsetPx={parseNativeInsetPx(readSearchParamValue(searchParams, "nativeListTopInsetPx"))}
      initialNativeConversationBannerPosition={readSearchParamValue(searchParams, "nativeConversationBannerPosition")}
      initialNativeConversationBottomInsetPx={parseNativeInsetPx(readSearchParamValue(searchParams, "nativeConversationBottomInsetPx"))}
      appleOAuthEnabled={false}
      googleOAuthEnabled={isGoogleOAuthConfigured()}
    />
  );
}
