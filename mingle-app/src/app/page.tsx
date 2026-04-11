import { DEFAULT_LOCALE } from "@/i18n";
import { resolveDefaultMingleClientReleaseVariant } from "@/lib/client-behavior-profile";
import LegacyHomeEntry from "@/web/legacy/v1.0.11/home-entry";
import AndroidV1011HomeEntry from "@/web/android/v1.0.11/home-entry";
import AndroidV110HomeEntry from "@/web/android/v1.1.0/home-entry";
import IosV1011HomeEntry from "@/web/ios/v1.0.11/home-entry";
import IosV110HomeEntry from "@/web/ios/v1.1.0/home-entry";

export default function Page() {
  const locale = DEFAULT_LOCALE;
  const releaseVariant = resolveDefaultMingleClientReleaseVariant();

  switch (releaseVariant) {
    case "legacy_default_v1_0_11":
      return LegacyHomeEntry({ locale });
    case "ios_v1_0_11":
      return IosV1011HomeEntry({ locale });
    case "android_v1_0_11":
      return AndroidV1011HomeEntry({ locale });
    case "ios_v1_1_0":
      return IosV110HomeEntry({ locale, searchParams: {} });
    case "android_v1_1_0":
      return AndroidV110HomeEntry({ locale, searchParams: {} });
  }
}
