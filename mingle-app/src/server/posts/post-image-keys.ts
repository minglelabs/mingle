/**
 * Post image object keys.
 *
 * Post images share a private bucket with conversation images, so a key a
 * client sends can never be trusted as-is: a known conversation key stored on a
 * post would make the post routes read (and on replace, delete) a private
 * conversation image. Every post-image key is therefore minted by the server
 * under a per-uploader prefix, and every write and read checks that prefix
 * against the user who owns the post or draft.
 */

import { randomUUID } from 'node:crypto'

const POST_IMAGE_PREFIX = 'post-images/'
const UUID_JPG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/

/** A fresh server-issued key for an image uploaded by `userId`. */
export function newPostImageKey(userId: string): string {
  return `${POST_IMAGE_PREFIX}${userId}/${randomUUID()}.jpg`
}

/**
 * Whether `key` is a post-image key the server issued to `userId`. Anything
 * else (a conversation key, another user's post image, a traversal attempt)
 * is rejected.
 */
export function isOwnedPostImageKey(key: unknown, userId: string): key is string {
  if (typeof key !== 'string' || !userId || userId.includes('/')) return false
  const ownerPrefix = `${POST_IMAGE_PREFIX}${userId}/`
  if (!key.startsWith(ownerPrefix)) return false
  return UUID_JPG.test(key.slice(ownerPrefix.length))
}

export type ImageKeyInput =
  | { kind: 'absent' }
  | { kind: 'clear' }
  | { kind: 'set'; key: string }
  | { kind: 'invalid' }

/**
 * Parse an optional `imageObjectKey` request field for `userId`: missing,
 * explicitly cleared (null / ''), a key that user owns, or invalid.
 */
export function parseImageKeyInput(input: Record<string, unknown>, userId: string): ImageKeyInput {
  if (!('imageObjectKey' in input) || input.imageObjectKey === undefined) return { kind: 'absent' }
  const value = input.imageObjectKey
  if (value === null || value === '') return { kind: 'clear' }
  return isOwnedPostImageKey(value, userId) ? { kind: 'set', key: value } : { kind: 'invalid' }
}
