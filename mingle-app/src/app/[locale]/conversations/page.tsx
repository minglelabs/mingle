import { isSupportedLocale } from "@/i18n";
import {
  resolveDefaultMingleClientReleaseVariant,
  readRequestedApiNamespaceFromSearchParams,
  resolveMingleClientReleaseVariant,
} from "@/lib/client-behavior-profile";
import DefaultV110ConversationsEntry from "@/web/default/v1.1.0/conversations-entry";
import DefaultV111ConversationsEntry from "@/web/default/v1.1.1/conversations-entry";
import DefaultV112ConversationsEntry from "@/web/default/v1.1.2/conversations-entry";
import DefaultV113ConversationsEntry from "@/web/default/v1.1.3/conversations-entry";
import LegacyConversationsEntry from "@/web/legacy/v1.0.11/conversations-entry";
import AndroidV1011ConversationsEntry from "@/web/android/v1.0.11/conversations-entry";
import AndroidV110ConversationsEntry from "@/web/android/v1.1.0/conversations-entry";
import AndroidV111ConversationsEntry from "@/web/android/v1.1.1/conversations-entry";
import AndroidV112ConversationsEntry from "@/web/android/v1.1.2/conversations-entry";
import AndroidV113ConversationsEntry from "@/web/android/v1.1.3/conversations-entry";
import IosV1011ConversationsEntry from "@/web/ios/v1.0.11/conversations-entry";
import IosV110ConversationsEntry from "@/web/ios/v1.1.0/conversations-entry";
import IosV111ConversationsEntry from "@/web/ios/v1.1.1/conversations-entry";
import IosV112ConversationsEntry from "@/web/ios/v1.1.2/conversations-entry";
import IosV113ConversationsEntry from "@/web/ios/v1.1.3/conversations-entry";
import { notFound } from "next/navigation";

type ConversationsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readSearchParamValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const rawValue = searchParams[key];
  if (typeof rawValue === "string") return rawValue.trim();
  if (Array.isArray(rawValue)) return (rawValue[0] || "").trim();
  return "";
}

function inferNativeApiNamespace(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const platform = readSearchParamValue(searchParams, "nativePlatform").toLowerCase();
  const clientVersion = readSearchParamValue(searchParams, "nativeClientVersion")
    .replace(/^v/i, "");
  if (platform !== "ios" && platform !== "android") return "";
  if (!/^\d+\.\d+\.\d+$/.test(clientVersion)) return "";
  return `${platform}/v${clientVersion}`;
}

export default async function ConversationsPage({ params, searchParams }: ConversationsPageProps) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const requestedApiNamespace = readRequestedApiNamespaceFromSearchParams(resolvedSearchParams);
  // Native tab/navigation parameters can survive a partial route transition
  // even when apiNamespace did not. Recover the release from the native app
  // version before considering the server's default, so a native room never
  // silently falls back to the legacy web entry.
  const inferredNativeApiNamespace = inferNativeApiNamespace(resolvedSearchParams);
  const releaseVariant = requestedApiNamespace
    ? resolveMingleClientReleaseVariant(requestedApiNamespace)
    : inferredNativeApiNamespace
      ? resolveMingleClientReleaseVariant(inferredNativeApiNamespace)
      : resolveDefaultMingleClientReleaseVariant();

  switch (releaseVariant) {
    case "legacy_default_v1_0_11":
      return LegacyConversationsEntry({ locale, searchParams: resolvedSearchParams });
    case "default_v1_1_0":
      return DefaultV110ConversationsEntry({ locale, searchParams: resolvedSearchParams });
    case "default_v1_1_1":
      return DefaultV111ConversationsEntry({ locale, searchParams: resolvedSearchParams });
    case "default_v1_1_2":
      return DefaultV112ConversationsEntry({ locale, searchParams: resolvedSearchParams });
    case "default_v1_1_3":
      return DefaultV113ConversationsEntry({ locale, searchParams: resolvedSearchParams });
    case "ios_v1_0_11":
      return IosV1011ConversationsEntry({ locale, searchParams: resolvedSearchParams });
    case "android_v1_0_11":
      return AndroidV1011ConversationsEntry({ locale, searchParams: resolvedSearchParams });
    case "ios_v1_1_0":
      return IosV110ConversationsEntry({ locale, searchParams: resolvedSearchParams });
    case "ios_v1_1_1":
      return IosV111ConversationsEntry({ locale, searchParams: resolvedSearchParams });
    case "ios_v1_1_2":
      return IosV112ConversationsEntry({ locale, searchParams: resolvedSearchParams });
    case "ios_v1_1_3":
      return IosV113ConversationsEntry({ locale, searchParams: resolvedSearchParams });
    case "android_v1_1_0":
      return AndroidV110ConversationsEntry({ locale, searchParams: resolvedSearchParams });
    case "android_v1_1_1":
      return AndroidV111ConversationsEntry({ locale, searchParams: resolvedSearchParams });
    case "android_v1_1_2":
      return AndroidV112ConversationsEntry({ locale, searchParams: resolvedSearchParams });
    case "android_v1_1_3":
      return AndroidV113ConversationsEntry({ locale, searchParams: resolvedSearchParams });
  }
}
