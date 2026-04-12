export {
  DEFAULT_LOCALE,
  LEGAL_DOCUMENT_LOCALES,
  SUPPORTED_LOCALES,
  TRANSLATED_LOCALES,
  isSupportedLocale,
  isTranslatedLocale,
  resolveDictionaryLocale,
  resolveLegalDocumentLocale,
  resolveLegalDocumentPathSegment,
  resolveSupportedLocaleTag,
  type AppLocale,
  type LegalDocumentLocale,
  type TranslatedAppLocale,
} from "@/i18n/config";
export { getDictionary } from "@/i18n/get-dictionary";
export { getVersionPolicyCopy } from "@/i18n/get-version-policy-copy";
export { resolveLivePhoneDemoComposerCopy } from "@/i18n/live-phone-demo-composer-copy";
export { resolveVersionPolicyFallbackCopy } from "@/i18n/version-policy-fallback-copy";
export type {
  AppDictionary,
  BaseAppDictionarySource,
  DeepPartial,
  LivePhoneDemoFeedbackCategory,
} from "@/i18n/types";
