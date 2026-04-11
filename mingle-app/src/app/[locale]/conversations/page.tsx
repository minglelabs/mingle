import { isSupportedLocale } from "@/i18n";
import {
  resolveDefaultMingleClientReleaseVariant,
  readRequestedApiNamespaceFromSearchParams,
  resolveMingleClientReleaseVariant,
} from "@/lib/client-behavior-profile";
import DefaultV110ConversationsEntry from "@/web/default/v1.1.0/conversations-entry";
import LegacyConversationsEntry from "@/web/legacy/v1.0.11/conversations-entry";
import AndroidV1011ConversationsEntry from "@/web/android/v1.0.11/conversations-entry";
import AndroidV110ConversationsEntry from "@/web/android/v1.1.0/conversations-entry";
import IosV1011ConversationsEntry from "@/web/ios/v1.0.11/conversations-entry";
import IosV110ConversationsEntry from "@/web/ios/v1.1.0/conversations-entry";
import { notFound } from "next/navigation";

type ConversationsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ConversationsPage({ params, searchParams }: ConversationsPageProps) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const requestedApiNamespace = readRequestedApiNamespaceFromSearchParams(resolvedSearchParams);
  const releaseVariant = requestedApiNamespace
    ? resolveMingleClientReleaseVariant(requestedApiNamespace)
    : resolveDefaultMingleClientReleaseVariant();

  switch (releaseVariant) {
    case "legacy_default_v1_0_11":
      return LegacyConversationsEntry({ locale, searchParams: resolvedSearchParams });
    case "default_v1_1_0":
      return DefaultV110ConversationsEntry({ locale, searchParams: resolvedSearchParams });
    case "ios_v1_0_11":
      return IosV1011ConversationsEntry({ locale, searchParams: resolvedSearchParams });
    case "android_v1_0_11":
      return AndroidV1011ConversationsEntry({ locale, searchParams: resolvedSearchParams });
    case "ios_v1_1_0":
      return IosV110ConversationsEntry({ locale, searchParams: resolvedSearchParams });
    case "android_v1_1_0":
      return AndroidV110ConversationsEntry({ locale, searchParams: resolvedSearchParams });
  }
}
