import { describe, expect, it } from 'vitest'
import {
  canPublish,
  draftIsDirty,
  generateClientPostId,
  hasMeaningfulText,
  MAX_POST_LENGTH,
  type ComposeState,
} from './compose-state'

describe('hasMeaningfulText', () => {
  it('treats whitespace-only bodies as empty', () => {
    expect(hasMeaningfulText('   \n\n  ')).toBe(false)
    expect(hasMeaningfulText('')).toBe(false)
    expect(hasMeaningfulText('hi')).toBe(true)
    expect(hasMeaningfulText('\n\nline\n')).toBe(true)
  })
})

describe('canPublish', () => {
  it('requires text or an image', () => {
    expect(canPublish({ sourceText: '', hasImage: false })).toBe(false)
    expect(canPublish({ sourceText: '   ', hasImage: false })).toBe(false)
    expect(canPublish({ sourceText: 'hi', hasImage: false })).toBe(true)
    expect(canPublish({ sourceText: '', hasImage: true })).toBe(true)
  })

  it('blocks bodies over the length limit', () => {
    expect(canPublish({ sourceText: 'a'.repeat(MAX_POST_LENGTH), hasImage: false })).toBe(true)
    expect(canPublish({ sourceText: 'a'.repeat(MAX_POST_LENGTH + 1), hasImage: false })).toBe(false)
    expect(canPublish({ sourceText: 'a'.repeat(MAX_POST_LENGTH + 1), hasImage: true })).toBe(false)
  })
})

describe('draftIsDirty', () => {
  const base: ComposeState = { sourceText: 'a', backgroundKey: 'k', imageObjectKey: null }
  it('detects changes in any tracked field', () => {
    expect(draftIsDirty(base, base)).toBe(false)
    expect(draftIsDirty(base, { ...base, sourceText: 'b' })).toBe(true)
    expect(draftIsDirty(base, { ...base, backgroundKey: 'other' })).toBe(true)
    expect(draftIsDirty(base, { ...base, imageObjectKey: 'img' })).toBe(true)
  })
})

describe('generateClientPostId', () => {
  it('matches the server id format and is unique', () => {
    const a = generateClientPostId()
    const b = generateClientPostId()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(12)
    expect(a.length).toBeLessThanOrEqual(128)
    expect(/^[\w-]+$/.test(a)).toBe(true)
  })
})
