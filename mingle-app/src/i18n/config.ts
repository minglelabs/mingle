import {
  APP_SUPPORTED_LOCALES,
  DEFAULT_MINGLE_LOCALE,
  PRIMARY_UI_LOCALES,
  isAppSupportedLocale,
  resolveAppSupportedLocaleTag,
  resolvePrimaryUiLocale,
  type AppSupportedLocale,
  type PrimaryUiLocale,
} from "@/i18n/mingle-locales";

export const SUPPORTED_LOCALES = APP_SUPPORTED_LOCALES;

export type AppLocale = AppSupportedLocale;

export const TRANSLATED_LOCALES = SUPPORTED_LOCALES;

export type TranslatedAppLocale = AppLocale;

export const LEGAL_DOCUMENT_LOCALES = PRIMARY_UI_LOCALES;

export type LegalDocumentLocale = PrimaryUiLocale;

export const DEFAULT_LOCALE: AppLocale = DEFAULT_MINGLE_LOCALE;

export function isSupportedLocale(value: string): value is AppLocale {
  return isAppSupportedLocale(value);
}

export function isTranslatedLocale(value: AppLocale): value is TranslatedAppLocale {
  return isSupportedLocale(value);
}

export function resolveDictionaryLocale(locale: AppLocale): TranslatedAppLocale {
  return locale;
}

export function resolveLegalDocumentLocale(locale: AppLocale): LegalDocumentLocale {
  return resolvePrimaryUiLocale(locale);
}

export function resolveLegalDocumentPathSegment(locale: AppLocale): string {
  return resolveLegalDocumentLocale(locale).toLowerCase();
}

export function resolveSupportedLocaleTag(rawValue: string): AppLocale | null {
  return resolveAppSupportedLocaleTag(rawValue);
}
