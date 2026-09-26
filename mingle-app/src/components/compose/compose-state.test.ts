import { describe, expect, it } from 'vitest'
import {
  canPublish,
  appendDraftPage,
  draftImageField,
  draftImagePath,
  draftIsDirty,
  editSaveError,
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

  it('sends the uploaded pixel size with the key when known', () => {
    expect(draftImageField({ kind: 'server', objectKey: 'k', width: 1536, height: 2048 })).toEqual({
      imageObjectKey: 'k',
      imageWidth: 1536,
      imageHeight: 2048,
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

describe('appendDraftPage', () => {
  const d = (id: string) => ({ id, sourceText: id, backgroundKey: null, imageObjectKey: null, updatedAt: '2026-09-26T00:00:00.000Z' })
  it('appends the next page and skips duplicates', () => {
    expect(appendDraftPage([d('a'), d('b')], [d('b'), d('c')]).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('editSaveError', () => {
  const res = (status: number, body: object) => new Response(JSON.stringify(body), { status })
  it('maps a 409 to the "edited elsewhere" conflict', async () => {
    await expect(editSaveError(res(409, { error: 'conflict' }))).resolves.toBe('conflict')
  })
  it('maps 403 account_restricted to the moderation notice', async () => {
    await expect(editSaveError(res(403, { error: 'account_restricted' }))).resolves.toBe('restricted')
  })
  it('treats any other failure as generic', async () => {
    await expect(editSaveError(res(403, { error: 'forbidden' }))).resolves.toBe('failed')
    await expect(editSaveError(res(500, {}))).resolves.toBe('failed')
  })
})
