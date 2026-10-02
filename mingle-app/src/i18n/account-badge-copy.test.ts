import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { accountBadgeCopy, type AccountBadgeCopy } from './account-badge-copy'

describe('accountBadgeCopy', () => {
  it('has the official badge label and description in every primary UI locale (15)', () => {
    expect(PRIMARY_UI_LOCALES).toHaveLength(15)
    const descriptions = new Set<string>()
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = accountBadgeCopy(locale)
      expect(copy.official.length).toBeGreaterThan(0)
      expect(copy.officialDescription.length).toBeGreaterThan(0)
      descriptions.add(copy.officialDescription)
    }
    // Translated per locale, not an English fallback.
    expect(descriptions.size).toBe(15)
  })

  it('falls back to English for an unknown locale', () => {
    expect(accountBadgeCopy('xx').official).toBe('Official')
    expect(accountBadgeCopy('xx').operator).toBe('Run by Mingle')
  })
})

describe('accountBadgeCopy: operator accounts', () => {
  const operatorKeys = [
    'operator',
    'operatorDescription',
    'operatorSheetTitle',
    'operatorSheetBody',
    'chatDisclosure',
    'pushLabel',
  ] as const satisfies ReadonlyArray<keyof AccountBadgeCopy>

  it('has every operator key, translated, in all 15 primary UI locales', () => {
    for (const key of operatorKeys) {
      const values = new Set<string>()
      for (const locale of PRIMARY_UI_LOCALES) {
        const value = accountBadgeCopy(locale)[key]
        expect(value.trim(), `${locale}.${key}`).not.toBe('')
        values.add(value)
      }
      // 15 distinct values: no locale falls back to another's text.
      expect(values.size, key).toBe(15)
    }
  })

  it('uses the approved Korean and English wording', () => {
    expect(accountBadgeCopy('ko')).toMatchObject({
      operator: '운영 계정',
      operatorDescription: 'Mingle 팀이 운영하는 계정',
      operatorSheetTitle: '운영 계정',
      operatorSheetBody: '이 계정은 개인이 아니라 Mingle 팀이 운영합니다. 게시물과 답장은 Mingle 팀원이 작성합니다.',
      chatDisclosure: '이 대화에는 Mingle 팀이 운영하는 계정이 있습니다. 메시지는 Mingle 팀원이 읽고 답장합니다.',
      pushLabel: '운영 계정',
    })
    expect(accountBadgeCopy('en')).toMatchObject({
      operator: 'Run by Mingle',
      operatorDescription: 'This account is run by the Mingle team.',
      operatorSheetTitle: 'Run by Mingle',
      operatorSheetBody: 'This account is not a private individual. It is run by the Mingle team, and Mingle staff write its posts and replies.',
      chatDisclosure: 'A Mingle-run account is in this chat. Mingle staff read and reply to its messages.',
      pushLabel: 'Run by Mingle',
    })
  })

  it('keeps the official description free of the operator wording', () => {
    expect(accountBadgeCopy('ko').officialDescription).toBe('Mingle 공식 계정')
    expect(accountBadgeCopy('ja').officialDescription).toBe('Mingle公式アカウント')
    expect(accountBadgeCopy('ko').officialDescription).not.toContain('운영')
    expect(accountBadgeCopy('ja').officialDescription).not.toContain('運営')
  })

  it('never gives the official and the operator badge the same text', () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = accountBadgeCopy(locale)
      expect(copy.operator, locale).not.toBe(copy.official)
      expect(copy.pushLabel, locale).not.toBe(copy.official)
      expect(copy.operatorDescription, locale).not.toBe(copy.officialDescription)
    }
  })
})
