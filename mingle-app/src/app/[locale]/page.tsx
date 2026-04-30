import { isSupportedLocale } from "@/i18n";
import {
  resolveDefaultMingleClientReleaseVariant,
  readRequestedApiNamespaceFromSearchParams,
  resolveMingleClientReleaseVariant,
} from "@/lib/client-behavior-profile";
import DefaultV110HomeEntry from "@/web/default/v1.1.0/home-entry";
import DefaultV111HomeEntry from "@/web/default/v1.1.1/home-entry";
import DefaultV112HomeEntry from "@/web/default/v1.1.2/home-entry";
import DefaultV113HomeEntry from "@/web/default/v1.1.3/home-entry";
import DefaultV200HomeEntry from "@/web/default/v2.0.0/home-entry";
import LegacyHomeEntry from "@/web/legacy/v1.0.11/home-entry";
import AndroidV1011HomeEntry from "@/web/android/v1.0.11/home-entry";
import AndroidV110HomeEntry from "@/web/android/v1.1.0/home-entry";
import AndroidV111HomeEntry from "@/web/android/v1.1.1/home-entry";
import AndroidV112HomeEntry from "@/web/android/v1.1.2/home-entry";
import AndroidV113HomeEntry from "@/web/android/v1.1.3/home-entry";
import AndroidV200HomeEntry from "@/web/android/v2.0.0/home-entry";
import IosV1011HomeEntry from "@/web/ios/v1.0.11/home-entry";
import IosV110HomeEntry from "@/web/ios/v1.1.0/home-entry";
import IosV111HomeEntry from "@/web/ios/v1.1.1/home-entry";
import IosV112HomeEntry from "@/web/ios/v1.1.2/home-entry";
import IosV113HomeEntry from "@/web/ios/v1.1.3/home-entry";
import IosV200HomeEntry from "@/web/ios/v2.0.0/home-entry";
import { notFound } from "next/navigation";

type LocalePageProps = {
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LocalePage({ params, searchParams }: LocalePageProps) {
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
      return LegacyHomeEntry({ locale });
    case "default_v1_1_0":
      return DefaultV110HomeEntry({ locale, searchParams: resolvedSearchParams });
    case "default_v1_1_1":
      return DefaultV111HomeEntry({ locale, searchParams: resolvedSearchParams });
    case "default_v1_1_2":
      return DefaultV112HomeEntry({ locale, searchParams: resolvedSearchParams });
    case "default_v1_1_3":
      return DefaultV113HomeEntry({ locale, searchParams: resolvedSearchParams });
    case "default_v2_0_0":
      return DefaultV200HomeEntry({ locale, searchParams: resolvedSearchParams });
    case "ios_v1_0_11":
      return IosV1011HomeEntry({ locale });
    case "android_v1_0_11":
      return AndroidV1011HomeEntry({ locale });
    case "ios_v1_1_0":
      return IosV110HomeEntry({ locale, searchParams: resolvedSearchParams });
    case "ios_v1_1_1":
      return IosV111HomeEntry({ locale, searchParams: resolvedSearchParams });
    case "ios_v1_1_2":
      return IosV112HomeEntry({ locale, searchParams: resolvedSearchParams });
    case "ios_v1_1_3":
      return IosV113HomeEntry({ locale, searchParams: resolvedSearchParams });
    case "ios_v2_0_0":
      return IosV200HomeEntry({ locale, searchParams: resolvedSearchParams });
    case "android_v1_1_0":
      return AndroidV110HomeEntry({ locale, searchParams: resolvedSearchParams });
    case "android_v1_1_1":
      return AndroidV111HomeEntry({ locale, searchParams: resolvedSearchParams });
    case "android_v1_1_2":
      return AndroidV112HomeEntry({ locale, searchParams: resolvedSearchParams });
    case "android_v1_1_3":
      return AndroidV113HomeEntry({ locale, searchParams: resolvedSearchParams });
    case "android_v2_0_0":
      return AndroidV200HomeEntry({ locale, searchParams: resolvedSearchParams });
  }
}
