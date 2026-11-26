'use client'

// The app's own photo gallery for the write screen (owner, 2026-11-27): the
// shell shows a native gallery (big preview on top, the phone's recent photos
// under it) over the WebView and hands back the photos picked, already made
// small enough to upload. Shells that report `photoGallery: true` in their
// `capabilities` message have it; every other shell (and a browser) keeps the
// system photo picker of <input type="file">.
//
// Web -> shell: { type: 'native_photo_gallery_open', payload: { requestId, max } }
// Shell -> web: CustomEvent 'mingle:native-photos' with
//   { requestId, type: 'picked', photos: [{ dataUrl, name? }] } or
//   { requestId, type: 'cancelled' } (also when access was refused).

import { NATIVE_SHELL_CAPABILITIES_STATE_KEY } from '@/lib/native-device-audio'

export const NATIVE_PHOTOS_EVENT = 'mingle:native-photos'
/** The gallery stays open as long as the person browses; this only drops a shell that never answers. */
const GALLERY_TIMEOUT_MS = 10 * 60 * 1000

type GalleryWindow = Window & {
  ReactNativeWebView?: { postMessage?: (message: string) => void }
  [NATIVE_SHELL_CAPABILITIES_STATE_KEY]?: unknown
}

type NativePhotosDetail = { requestId?: unknown; type?: unknown; photos?: unknown }

export function parseNativePhotoGalleryCapability(detail: unknown): boolean {
  if (typeof detail !== 'object' || detail === null || Array.isArray(detail)) return false
  const record = detail as Record<string, unknown>
  return record.type === 'capabilities' && record.photoGallery === true
}

export function isNativePhotoGalleryAvailable(): boolean {
  if (typeof window === 'undefined') return false
  const nativeWindow = window as GalleryWindow
  return typeof nativeWindow.ReactNativeWebView?.postMessage === 'function'
    && parseNativePhotoGalleryCapability(nativeWindow[NATIVE_SHELL_CAPABILITIES_STATE_KEY])
}

/** The picked photos of an answer as files, in the order picked; null for a cancel or an answer that is not one. */
export function filesFromNativePhotos(detail: NativePhotosDetail | null): File[] | null {
  if (!detail || detail.type !== 'picked' || !Array.isArray(detail.photos)) return null
  const files: File[] = []
  detail.photos.forEach((entry, index) => {
    const record = entry as { dataUrl?: unknown; name?: unknown } | null
    const dataUrl = typeof record?.dataUrl === 'string' ? record.dataUrl : ''
    const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl)
    if (!match) return
    const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0))
    const extension = match[1].split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
    const name = typeof record?.name === 'string' && record.name ? record.name : `photo-${index + 1}.${extension}`
    files.push(new File([bytes], name, { type: match[1] }))
  })
  return files.length > 0 ? files : null
}

/** Opens the app's gallery and waits for the photos picked (null when closed without any). */
export function openNativePhotoGallery(max: number): Promise<File[] | null> {
  const requestId = `photos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => finish(null), GALLERY_TIMEOUT_MS)
    function handle(event: Event) {
      const detail = (event as CustomEvent<NativePhotosDetail>).detail
      if (detail && detail.requestId === requestId) finish(detail)
    }
    function finish(detail: NativePhotosDetail | null) {
      window.clearTimeout(timer)
      window.removeEventListener(NATIVE_PHOTOS_EVENT, handle)
      try {
        resolve(filesFromNativePhotos(detail))
      } catch {
        resolve(null)
      }
    }
    window.addEventListener(NATIVE_PHOTOS_EVENT, handle)
    ;(window as GalleryWindow).ReactNativeWebView?.postMessage?.(
      JSON.stringify({ type: 'native_photo_gallery_open', payload: { requestId, max } }),
    )
  })
}
