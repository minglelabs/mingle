import { canonicalizeSttLanguageCode } from './stt-languages'

export const BIO_DEFAULT_LANGUAGES = ['en', 'zh-CN', 'ja', 'ko'] as const
export const BIO_CHANGED_EVENT = 'mingle:profile-bio-changed'
export const DISPLAY_LANGUAGE_CHANGED_EVENT = 'mingle:display-language-changed'
export type ProfileBioSnapshot = {
  versionId: string | null
  original: string
  sourceLanguage: string | null
  language: string
  translation: string | null
  status: 'idle' | 'running' | 'succeeded' | 'failed'
  detecting: boolean
  updating: boolean
  draft?: { original: string; status: 'running' | 'succeeded' | 'failed' }
}
export function sameBioLanguage(source: string | null, target: string): boolean {
  return Boolean(source && canonicalizeSttLanguageCode(source) === canonicalizeSttLanguageCode(target))
}
export function resolveBioDisplayLanguage(preference: string | null | undefined, primaryLanguages: string[], defaults: string[], locale: string): string {
  return canonicalizeSttLanguageCode(preference || '')
    || canonicalizeSttLanguageCode(primaryLanguages[0] || '')
    || canonicalizeSttLanguageCode(defaults[0] || '')
    || canonicalizeSttLanguageCode(locale) || 'en'
}
