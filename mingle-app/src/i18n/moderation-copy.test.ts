import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { ACCOUNT_RESTRICTED_ERROR, isAccountRestrictedBody, isAccountRestrictedResponse } from '@/lib/account-restriction'
import { moderationCopy } from './moderation-copy'

describe('moderationCopy', () => {
  it('has the restricted-account notice in every primary UI locale (15)', () => {
    expect(PRIMARY_UI_LOCALES).toHaveLength(15)
    const seen = new Set<string>()
    for (const locale of PRIMARY_UI_LOCALES) {
      const text = moderationCopy(locale).accountRestricted
      expect(text.length).toBeGreaterThan(0)
      seen.add(text)
    }
    // Every locale is actually translated, not an English fallback.
    expect(seen.size).toBe(15)
  })

  it('falls back to English for an unknown locale', () => {
    expect(moderationCopy('xx').accountRestricted).toBe(moderationCopy('en').accountRestricted)
  })
})

describe('account restriction detection', () => {
  it('matches only the restricted-account body', () => {
    expect(isAccountRestrictedBody({ error: ACCOUNT_RESTRICTED_ERROR })).toBe(true)
    expect(isAccountRestrictedBody({ error: 'forbidden' })).toBe(false)
    expect(isAccountRestrictedBody(null)).toBe(false)
  })

  it('matches a 403 response without consuming its body', async () => {
    const res = new Response(JSON.stringify({ error: ACCOUNT_RESTRICTED_ERROR }), { status: 403 })
    expect(await isAccountRestrictedResponse(res)).toBe(true)
    expect(await res.json()).toEqual({ error: ACCOUNT_RESTRICTED_ERROR })
    expect(await isAccountRestrictedResponse(new Response('{}', { status: 403 }))).toBe(false)
    expect(
      await isAccountRestrictedResponse(new Response(JSON.stringify({ error: ACCOUNT_RESTRICTED_ERROR }), { status: 400 })),
    ).toBe(false)
  })
})
