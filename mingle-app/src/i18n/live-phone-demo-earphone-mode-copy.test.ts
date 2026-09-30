import { LEGAL_DOCUMENT_LOCALES } from '@/i18n'
import { describe, expect, it } from 'vitest'
import { resolveLivePhoneDemoTtsActionCopy } from '@/components/LivePhoneDemo/live-phone-demo.tts-actions'
import { getSttLanguageDisplayName } from '@/lib/stt-languages'
import {
  formatLivePhoneDemoEarphoneModeReadLanguageNotice,
  resolveLivePhoneDemoEarphoneModeCopy,
} from './live-phone-demo-earphone-mode-copy'

describe('live-phone-demo-earphone-mode-copy', () => {
  it('uses the requested Korean title and confirm label', () => {
    const copy = resolveLivePhoneDemoEarphoneModeCopy('ko-KR')
    expect(copy.label).toBe('이어폰 모드')
    expect(copy.noticeConfirmLabel).toBe('확인')
    expect(copy.noticeBody).toContain('이어폰이나 헤드셋')
    expect(copy.noticeNotConnectedBody).toContain('연결하면')
  })

  it('provides complete copy for all 15 primary UI locales', () => {
    expect(LEGAL_DOCUMENT_LOCALES).toHaveLength(15)
    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      const copy = resolveLivePhoneDemoEarphoneModeCopy(locale)
      for (const value of Object.values(copy)) {
        expect(value.trim().length).toBeGreaterThan(0)
      }
      expect(copy.onStateLabel).not.toBe(copy.offStateLabel)
      expect(resolveLivePhoneDemoTtsActionCopy(locale).preparingIndicatorLabel.trim().length).toBeGreaterThan(0)
    }
  })

  it('falls back to English for an extended app locale', () => {
    expect(resolveLivePhoneDemoEarphoneModeCopy('sv-SE').label).toBe('Earphone mode')
  })
})

describe('earphone mode read-language sentence', () => {
  it('uses the requested Korean sentence', () => {
    expect(formatLivePhoneDemoEarphoneModeReadLanguageNotice('ko-KR', 'ko')).toBe(
      '한국어로 번역된 모든 문장을 한국어 음성으로 들려드려요. 한국어로 말한 문장은 읽지 않아요.',
    )
    expect(formatLivePhoneDemoEarphoneModeReadLanguageNotice('ko', 'en')).toBe(
      '영어로 번역된 모든 문장을 영어 음성으로 들려드려요. 영어로 말한 문장은 읽지 않아요.',
    )
  })

  it('picks the Korean particle from the last syllable', () => {
    // 중국어(대만): 만 ends in ㄴ -> 으로.
    expect(formatLivePhoneDemoEarphoneModeReadLanguageNotice('ko', 'zh-TW')).toBe(
      '중국어(대만)으로 번역된 모든 문장을 중국어(대만) 음성으로 들려드려요. 중국어(대만)으로 말한 문장은 읽지 않아요.',
    )
  })

  it('names the language with the app helper in every locale', () => {
    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      for (const language of ['ko', 'en', 'ja', 'zh-CN']) {
        const name = getSttLanguageDisplayName(language, locale)!
        const sentence = formatLivePhoneDemoEarphoneModeReadLanguageNotice(locale, language)
        expect(name.length).toBeGreaterThan(0)
        // "translated into L" and "spoken in L" at least.
        expect(sentence.split(name).length - 1).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('changes with the selected language', () => {
    expect(formatLivePhoneDemoEarphoneModeReadLanguageNotice('en', 'ja')).toBe(
      'Every sentence translated into Japanese is read aloud in Japanese. Sentences spoken in Japanese are not read.',
    )
    expect(formatLivePhoneDemoEarphoneModeReadLanguageNotice('en', 'ko')).toContain('into Korean')
    // An extended app locale gets the English sentence with English names.
    expect(formatLivePhoneDemoEarphoneModeReadLanguageNotice('sv-SE', 'ko')).toContain('into Korean')
  })
})
