import { describe, expect, it } from 'vitest'
import { isOwnedPostImageKey, newPostImageKey, parseImageKeyInput } from './post-image-keys'

const UUID = '0f8fad5b-d9cb-469f-a165-70867728950e'

describe('post image keys', () => {
  it('mints keys under the uploader prefix that the uploader owns', () => {
    const key = newPostImageKey('user-1')
    expect(key).toMatch(/^post-images\/user-1\/[0-9a-f-]{36}\.jpg$/)
    expect(isOwnedPostImageKey(key, 'user-1')).toBe(true)
    expect(isOwnedPostImageKey(key, 'user-2')).toBe(false)
  })

  it.each([
    `conversation-images/conv-1/${UUID}.jpg`,
    `post-images/${UUID}.jpg`,
    `post-images/user-10/${UUID}.jpg`,
    `post-images/user-1/${UUID}.png`,
    `post-images/user-1/../conversation-images/${UUID}.jpg`,
    `post-images/user-1/sub/${UUID}.jpg`,
    '',
    42,
    null,
  ])('rejects %s for user-1', (key) => {
    expect(isOwnedPostImageKey(key, 'user-1')).toBe(false)
  })

  it('refuses an empty or slash-bearing owner id', () => {
    expect(isOwnedPostImageKey(`post-images//${UUID}.jpg`, '')).toBe(false)
    expect(isOwnedPostImageKey(`post-images/a/b/${UUID}.jpg`, 'a/b')).toBe(false)
  })

  it('parses the request field', () => {
    expect(parseImageKeyInput({}, 'user-1')).toEqual({ kind: 'absent' })
    expect(parseImageKeyInput({ imageObjectKey: null }, 'user-1')).toEqual({ kind: 'clear' })
    expect(parseImageKeyInput({ imageObjectKey: '' }, 'user-1')).toEqual({ kind: 'clear' })
    expect(parseImageKeyInput({ imageObjectKey: `post-images/user-1/${UUID}.jpg` }, 'user-1'))
      .toEqual({ kind: 'set', key: `post-images/user-1/${UUID}.jpg` })
    expect(parseImageKeyInput({ imageObjectKey: 'conversation-images/x.jpg' }, 'user-1')).toEqual({ kind: 'invalid' })
  })
})
