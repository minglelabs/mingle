import { describe, expect, it } from 'vitest'
import {
  collectConversationImages,
  conversationImagePath,
  conversationImageSrc,
  conversationImagesKey,
  findConversationImageIndex,
} from './conversation-image-gallery.logic'

const image = (messageId: string, extra: object = {}) => ({ conversationId: 'c1', messageId, width: 800, height: 600, ...extra })

describe('collectConversationImages', () => {
  it('keeps the photos of the messages in order and skips everything else', () => {
    const images = collectConversationImages([
      { image: image('m1') },
      {},
      { image: 'nope' },
      { image: { conversationId: 'c1', messageId: 'bad id!', width: 10, height: 10 } },
      { image: image('m2', { width: 3000 }) },
      { image: image('m3') },
    ])
    expect(images.map(entry => entry.messageId)).toEqual(['m1', 'm3'])
  })

  it('lists a message once', () => {
    expect(collectConversationImages([{ image: image('m1') }, { image: image('m1') }]).map(entry => entry.messageId)).toEqual(['m1'])
  })

  it('is empty without photos', () => {
    expect(collectConversationImages([])).toEqual([])
    expect(collectConversationImages([{}, { image: null }])).toEqual([])
  })
})

describe('gallery keys and lookups', () => {
  const images = [image('m1'), image('m2'), image('m3')]

  it('changes the key when a photo is added, removed or moved, not when only the objects are new', () => {
    const key = conversationImagesKey(images)
    expect(conversationImagesKey(images.map(entry => ({ ...entry })))).toBe(key)
    expect(conversationImagesKey([...images, image('m4')])).not.toBe(key)
    expect(conversationImagesKey(images.slice(1))).not.toBe(key)
    expect(conversationImagesKey([images[1], images[0], images[2]])).not.toBe(key)
  })

  it('finds a photo by its message', () => {
    expect(findConversationImageIndex(images, 'm2')).toBe(1)
    expect(findConversationImageIndex(images, 'zzz')).toBe(-1)
  })

  it('builds the authenticated image path with an optional retry marker', () => {
    expect(conversationImagePath(image('m 1'))).toMatch(/\/conversations\/c1\/images\/m%201$/)
    expect(conversationImageSrc(image('m1'))).toBe(conversationImagePath(image('m1')))
    expect(conversationImageSrc(image('m1'), 2)).toBe(`${conversationImagePath(image('m1'))}?retry=2`)
  })
})
