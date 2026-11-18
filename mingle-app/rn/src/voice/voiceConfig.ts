// Resolves the VoiceApi config (base URL + versioned namespace) and the user's
// listening language + locale from the shell's runtime config. These mirror the
// values App.tsx already computes (WEB_APP_BASE_URL, VALIDATED_API_NAMESPACE)
// so the native REST calls hit the same host and namespace the web layer uses.

import { resolvePrimaryUiLocaleTag } from '../../../src/i18n/mingle-locales';

export type VoiceRuntimeConfig = {
  baseUrl: string;
  apiNamespace: string;
  /** Primary UI locale, e.g. 'ko' | 'en' — drives string table + default lang. */
  primaryLocale: string;
  /** The user's listening/speaking language code for LiveKit attributes. */
  myLang: string;
};

export type ResolveVoiceConfigInput = {
  webAppBaseUrl: string;
  validatedApiNamespace: string;
  deviceLocaleTag?: string;
  /** Explicit override from the web (user's chosen interpretation language). */
  preferredLang?: string;
};

export function resolveVoiceConfig(input: ResolveVoiceConfigInput): VoiceRuntimeConfig {
  const baseUrl = (input.webAppBaseUrl || '').trim().replace(/\/+$/, '');
  const apiNamespace = (input.validatedApiNamespace || '').trim();
  const primaryLocale = resolvePrimaryUiLocaleTag(input.deviceLocaleTag || '') ?? 'en';
  const myLang = (input.preferredLang || '').trim() || primaryLocale;
  return { baseUrl, apiNamespace, primaryLocale, myLang };
}
