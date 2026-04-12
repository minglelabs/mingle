import {
  APP_SUPPORTED_LOCALES,
  resolveAppSupportedLocaleTag,
  resolvePrimaryUiLocaleTag,
  type AppSupportedLocale,
  type PrimaryUiLocale,
} from "../../src/i18n/mingle-locales";
import {
  getMingleVersionPolicyFallbackCopy,
  type MingleVersionPolicyCopy,
} from "../../src/i18n/mingle-version-policy";

export type RnUiLocale = AppSupportedLocale;
export type VersionPolicyLocale = PrimaryUiLocale;
export type VersionPolicyFallbackCopy = MingleVersionPolicyCopy;

export const WEB_SUPPORTED_LOCALE_SEGMENTS = new Set(
  Array.from(APP_SUPPORTED_LOCALES, locale => locale.toLowerCase()),
);

export function resolveWebLocaleSegment(rawLocaleTag: string): RnUiLocale {
  return resolveAppSupportedLocaleTag(rawLocaleTag) ?? "ko";
}

export function resolveVersionPolicyLocale(rawLocaleTag: string): VersionPolicyLocale {
  return resolvePrimaryUiLocaleTag(rawLocaleTag) ?? "en";
}

export function getVersionPolicyFallbackCopy(
  locale: VersionPolicyLocale | string,
): VersionPolicyFallbackCopy {
  return getMingleVersionPolicyFallbackCopy(locale);
}
