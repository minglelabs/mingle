import { type AppLocale } from "@/i18n/config";
import {
  getMingleVersionPolicyFallbackCopy,
} from "@/i18n/mingle-version-policy";
import type { AppDictionary } from "@/i18n/types";

export type VersionPolicyFallbackCopy = AppDictionary["versionPolicy"];

export function resolveVersionPolicyFallbackCopy(
  locale: AppLocale | string,
): VersionPolicyFallbackCopy {
  return getMingleVersionPolicyFallbackCopy(locale);
}
