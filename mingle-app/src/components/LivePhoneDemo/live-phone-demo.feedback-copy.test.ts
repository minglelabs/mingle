import { describe, expect, it } from 'vitest'
import { resolveLivePhoneDemoFeedbackCopy } from './live-phone-demo.feedback-copy'

describe('live-phone-demo.feedback-copy', () => {
  it('resolves Korean copy from a regional locale tag', () => {
    expect(resolveLivePhoneDemoFeedbackCopy('ko-KR').sendButtonLabel).toBe('보내기')
  })

  it('falls back to English for unsupported locales', () => {
    expect(resolveLivePhoneDemoFeedbackCopy('sv-SE').pageTitle).toBe('Feedback')
  })

  it('resolves traditional Chinese copy for Hant locales', () => {
    const copy = resolveLivePhoneDemoFeedbackCopy('zh-Hant')
    expect(copy.pageTitle).toBe('回饋')
    expect(copy.sendButtonLabel).toBe('送出')
  })

  it('preserves accented French copy', () => {
    const copy = resolveLivePhoneDemoFeedbackCopy('fr-FR')
    expect(copy.composeTabLabel).toBe('Écrire')
    expect(copy.historyEmptyLabel).toBe("Vous n'avez encore envoyé aucun message.")
  })

  it('uses native Russian script copy', () => {
    const copy = resolveLivePhoneDemoFeedbackCopy('ru-RU')
    expect(copy.pageTitle).toBe('Обратная связь')
    expect(copy.sendButtonLabel).toBe('Отправить')
  })
})
