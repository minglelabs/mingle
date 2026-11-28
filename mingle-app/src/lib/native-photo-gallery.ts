'use client'

// The app's own photo gallery for the write screen (owner, 2026-11-27): the
// shell shows a native gallery (big preview on top, the phone's recent photos
// under it) over the WebView and hands back the photos picked, already made
// small enough to upload. Shells that report `photoGallery: true` in their
// `capabilities` message have it; every other shell (and a browser) keeps the
// system photo picker of <input type="file">.
//
// Web -> shell: { type: 'native_photo_gallery_open', payload: { requestId, max, labels } }
//   (labels: the gallery's words in the page's language; the shell has none of its own)
// Shell -> web: CustomEvent 'mingle:native-photos' with
//   { requestId, type: 'picked', photos: [{ dataUrl, name? }] } or
//   { requestId, type: 'cancelled' }, or
//   { requestId, type: 'denied' } (photo access refused: this page keeps the
//   system picker from then on), or
//   { requestId, type: 'skipped' } (no photo: write without one).

import { NATIVE_SHELL_CAPABILITIES_STATE_KEY } from '@/lib/native-device-audio'

export const NATIVE_PHOTOS_EVENT = 'mingle:native-photos'
/** The gallery stays open as long as the person browses; this only drops a shell that never answers at all. */
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

// Photo access was refused in the app's gallery: the system picker (which needs no access) from then on.
let refusedThisSession = false

export function isNativePhotoGalleryAvailable(): boolean {
  if (typeof window === 'undefined' || refusedThisSession) return false
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

export type NativePhotoGalleryLabels = { title: string; next: string; close: string; limited: string; denied: string; openSettings: string; skip: string; recent: string; albums: string }

export type NativePhotoGalleryResult =
  | { outcome: 'picked'; files: File[] }
  | { outcome: 'skipped' | 'cancelled' | 'denied'; files: null }

function resultOf(detail: NativePhotosDetail | null): NativePhotoGalleryResult {
  const files = filesFromNativePhotos(detail)
  if (files) return { outcome: 'picked', files }
  if (detail?.type === 'skipped') return { outcome: 'skipped', files: null }
  if (detail?.type === 'denied') return { outcome: 'denied', files: null }
  return { outcome: 'cancelled', files: null }
}

/** Opens the app's gallery and waits for how it closed: photos picked, text only, closed, or access refused. */
export function openNativePhotoGallery(max: number, labels: NativePhotoGalleryLabels): Promise<NativePhotoGalleryResult> {
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
      if (detail?.type === 'denied') refusedThisSession = true
      // The last answer, for checking on a phone (QA bridge reads it).
      ;(window as GalleryWindow & { __mingleLastNativePhotos?: unknown }).__mingleLastNativePhotos = {
        type: detail?.type ?? 'timeout',
        count: Array.isArray(detail?.photos) ? detail.photos.length : 0,
        reason: (detail as { reason?: unknown } | null)?.reason ?? null,
      }
      try {
        resolve(resultOf(detail))
      } catch {
        resolve({ outcome: 'cancelled', files: null })
      }
    }
    window.addEventListener(NATIVE_PHOTOS_EVENT, handle)
    ;(window as GalleryWindow).ReactNativeWebView?.postMessage?.(
      JSON.stringify({ type: 'native_photo_gallery_open', payload: { requestId, max, labels } }),
    )
  })
}
