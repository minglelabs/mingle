import { describe, expect, it } from 'vitest'
import {
  canPublish,
  draftImageField,
  draftImagePath,
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

describe('draftImageField', () => {
  it('saves an uploaded image by key so the draft keeps its photo', () => {
    expect(draftImageField({ kind: 'server', objectKey: 'post-images/u1/k.jpg' })).toEqual({
      imageObjectKey: 'post-images/u1/k.jpg',
    })
  })

  it('clears the stored image when the photo is removed', () => {
    expect(draftImageField({ kind: 'none' })).toEqual({ imageObjectKey: null })
  })

  it('leaves the stored image alone while an upload is pending', () => {
    expect(draftImageField({ kind: 'local' })).toEqual({})
  })

  it('serves a reopened draft image from the owner-only draft image route', () => {
    expect(draftImagePath('d 1')).toBe('/posts/images?draftId=d%201')
  })
})
