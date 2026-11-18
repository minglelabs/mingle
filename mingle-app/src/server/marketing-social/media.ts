import { randomBytes } from 'node:crypto'
import { putProfileImage, readProfileImageStorageConfig } from '@/server/profile-image-storage'
import { isMp4, readMp4Info, type Mp4Info } from './mp4'
import { COVER_MAX_BYTES, VIDEO_MAX_BYTES, VIDEO_MAX_DURATION_MS } from './types'

/**
 * Marketing videos and covers live in the PUBLIC R2 bucket (the profile image
 * bucket) under `marketing-videos/`, because Instagram and Threads fetch the
 * file from a public `video_url` themselves. Keys carry 128 random bits.
 */
export const MARKETING_MEDIA_PREFIX = 'marketing-videos/'

export type StoredMedia =
  | { ok: true; kind: 'video'; objectKey: string; url: string; bytes: number; info: Mp4Info }
  | { ok: true; kind: 'cover'; objectKey: string; url: string; bytes: number }
  | { ok: false; error: string; status: number }

function sniffImage(bytes: Uint8Array): 'image/jpeg' | 'image/png' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  return null
}

export function validateVideo(bytes: Uint8Array): { ok: true; info: Mp4Info } | { ok: false; error: string } {
  if (bytes.byteLength > VIDEO_MAX_BYTES) return { ok: false, error: 'video_too_large' }
  if (!isMp4(bytes)) return { ok: false, error: 'not_mp4' }
  const info = readMp4Info(bytes)
  if (info.durationMs !== null && info.durationMs > VIDEO_MAX_DURATION_MS) return { ok: false, error: 'video_too_long' }
  return { ok: true, info }
}

export async function storeMarketingMedia(kind: 'video' | 'cover', file: File): Promise<StoredMedia> {
  if (!readProfileImageStorageConfig()) return { ok: false, error: 'storage_not_configured', status: 503 }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const folder = `${MARKETING_MEDIA_PREFIX}${new Date().toISOString().slice(0, 10)}/${randomBytes(16).toString('hex')}`
  if (kind === 'video') {
    const checked = validateVideo(bytes)
    if (!checked.ok) return { ok: false, error: checked.error, status: 400 }
    const objectKey = `${folder}/video.mp4`
    const url = await putProfileImage({ objectKey, body: bytes, contentType: 'video/mp4' })
    return { ok: true, kind, objectKey, url, bytes: bytes.byteLength, info: checked.info }
  }
  if (bytes.byteLength > COVER_MAX_BYTES) return { ok: false, error: 'cover_too_large', status: 413 }
  const type = sniffImage(bytes)
  if (!type) return { ok: false, error: 'cover_not_image', status: 400 }
  const objectKey = `${folder}/cover.${type === 'image/png' ? 'png' : 'jpg'}`
  const url = await putProfileImage({ objectKey, body: bytes, contentType: type })
  return { ok: true, kind, objectKey, url, bytes: bytes.byteLength }
}

/** Only URLs this module minted may be posted (blocks posting arbitrary URLs through the admin API). */
export function isMarketingMediaUrl(url: unknown): url is string {
  const config = readProfileImageStorageConfig()
  if (!config || typeof url !== 'string') return false
  return url.startsWith(`${config.publicBaseUrl}/${MARKETING_MEDIA_PREFIX}`) && !url.includes('..')
}

export function objectKeyFromMarketingUrl(url: string): string {
  const config = readProfileImageStorageConfig()
  if (!config) throw new Error('storage_not_configured')
  return decodeURIComponent(url.slice(config.publicBaseUrl.length + 1))
}
