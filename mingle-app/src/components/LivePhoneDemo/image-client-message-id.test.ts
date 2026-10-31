import { describe, expect, it } from 'vitest'
import { createImageClientMessageId } from './image-client-message-id'

const SERVER_PATTERN = /^[\w-]{12,128}$/

describe('createImageClientMessageId', () => {
  it('uses crypto.randomUUID when it exists', () => {
    const id = createImageClientMessageId({ randomUUID: () => '11111111-2222-4333-8444-555555555555' })
    expect(id).toBe('image-11111111-2222-4333-8444-555555555555')
    expect(id).toMatch(SERVER_PATTERN)
  })

  it('falls back to getRandomValues without randomUUID (iOS < 15.4, http origin)', () => {
    const id = createImageClientMessageId({ getRandomValues: array => array.fill(171) })
    expect(id).toBe(`image-${'ab'.repeat(16)}`)
    expect(id).toMatch(SERVER_PATTERN)
  })

  it('still returns a valid id with no crypto at all', () => {
    expect(createImageClientMessageId({})).toMatch(SERVER_PATTERN)
    expect(createImageClientMessageId(undefined)).toMatch(SERVER_PATTERN)
  })
})
