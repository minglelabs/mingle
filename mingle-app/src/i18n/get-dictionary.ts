import { DEFAULT_LOCALE, resolveDictionaryLocale, type AppLocale } from "@/i18n/config";
import { localeDictionaries } from "@/i18n/dictionaries/catalog";
import { getSupplementalDictionary } from "@/i18n/get-supplemental-dictionary";
import type { AppDictionary, BaseAppDictionarySource, DeepPartial } from "@/i18n/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, override: DeepPartial<T>): T {
  if (Array.isArray(base)) {
    return (Array.isArray(override) ? override : base) as T;
  }

  if (!isRecord(base) || !isRecord(override)) {
    return (override ?? base) as T;
  }

  const merged: Record<string, unknown> = { ...base };
  for (const [key, overrideValue] of Object.entries(override)) {
    if (overrideValue === undefined) {
      continue;
    }

    const baseValue = merged[key];
    merged[key] = isRecord(baseValue) && isRecord(overrideValue)
      ? deepMerge(baseValue, overrideValue)
      : overrideValue;
  }

  return merged as T;
}

function buildBaseDictionary(locale: AppLocale): BaseAppDictionarySource {
  const localeDictionary = localeDictionaries[resolveDictionaryLocale(locale)] ?? localeDictionaries[DEFAULT_LOCALE];
  return deepMerge(localeDictionaries[DEFAULT_LOCALE], localeDictionary);
}

export function getDictionary(locale: AppLocale): AppDictionary {
  const baseDictionary = buildBaseDictionary(locale);
  return deepMerge(baseDictionary as AppDictionary, getSupplementalDictionary(locale));
}
