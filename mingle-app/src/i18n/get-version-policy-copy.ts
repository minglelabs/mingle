import { type AppLocale } from "@/i18n/config";
import {
  generatedVersionPolicyCopy,
  type VersionPolicyCopy as GeneratedVersionPolicyCopy,
} from "@/i18n/generated-version-policy-copy";
import { resolveVersionPolicyFallbackCopy } from "@/i18n/version-policy-fallback-copy";
import type { AppDictionary } from "@/i18n/types";

export function getVersionPolicyCopy(locale: AppLocale): AppDictionary["versionPolicy"] {
  const fallbackCopy = resolveVersionPolicyFallbackCopy(locale);
  const generatedCopy: Partial<GeneratedVersionPolicyCopy> = generatedVersionPolicyCopy[locale] ?? {};

  return {
    ...fallbackCopy,
    ...generatedCopy,
  };
}
