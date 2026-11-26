import { describe, expect, it } from 'vitest'
import { filesFromNativePhotos, parseNativePhotoGalleryCapability } from './native-photo-gallery'

describe('native photo gallery bridge', () => {
  it('is offered only by a shell that says so', () => {
    expect(parseNativePhotoGalleryCapability({ type: 'capabilities', photoGallery: true })).toBe(true)
    expect(parseNativePhotoGalleryCapability({ type: 'capabilities', faceCheck: true })).toBe(false)
    expect(parseNativePhotoGalleryCapability(null)).toBe(false)
  })

  it('turns the picked photos into files, in order, skipping anything that is not an image', () => {
    const tiny = 'data:image/jpeg;base64,' + btoa('abc')
    const files = filesFromNativePhotos({ type: 'picked', photos: [{ dataUrl: tiny }, { dataUrl: 'nope' }, { dataUrl: tiny, name: 'b.jpg' }] })
    expect(files?.map((file) => [file.name, file.type, file.size])).toEqual([['photo-1.jpg', 'image/jpeg', 3], ['b.jpg', 'image/jpeg', 3]])
    expect(filesFromNativePhotos({ type: 'cancelled' })).toBeNull()
    expect(filesFromNativePhotos({ type: 'denied' })).toBeNull()
  })
})
