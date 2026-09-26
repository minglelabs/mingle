/**
 * Shared types + small pure helpers for the compose surface.
 * Kept framework-agnostic so they can be unit-tested without React.
 */

import { isAccountRestrictedResponse } from '@/lib/account-restriction'

/** A draft as returned by GET/POST/PATCH /posts/drafts. */
export type ComposeDraft = {
  id: string
  sourceText: string | null
  backgroundKey: string | null
  imageObjectKey: string | null
  /** Stored pixel size of the draft photo (null for drafts saved before it was kept). */
  imageWidth?: number | null
  imageHeight?: number | null
  updatedAt: string
}

/** GET /posts/drafts: newest-updated first; `nextCursor` loads the next page. */
export type ComposeDraftListResponse = {
  drafts: ComposeDraft[]
  nextCursor?: string | null
}

/** The editable state of a post being composed or edited. */
export type ComposeState = {
  sourceText: string
  backgroundKey: string | null
  /** Server object key of an already-uploaded image (draft/edit), or null. */
  imageObjectKey: string | null
}

export const MAX_POST_LENGTH = 1000

/** Trimmed emptiness check — a body of only whitespace does not count as text. */
export function hasMeaningfulText(text: string): boolean {
  return text.trim().length > 0
}

/**
 * Can this state be published? Text OR an image must be present, and the body
 * (untrimmed, since line breaks count toward the limit like the server) must be
 * within the limit.
 */
export function canPublish(state: { sourceText: string; hasImage: boolean }): boolean {
  if (state.sourceText.length > MAX_POST_LENGTH) return false
  return hasMeaningfulText(state.sourceText) || state.hasImage
}

/** Whether two compose states differ enough to warrant a draft autosave. */
export function draftIsDirty(a: ComposeState, b: ComposeState): boolean {
  return (
    a.sourceText !== b.sourceText ||
    a.backgroundKey !== b.backgroundKey ||
    a.imageObjectKey !== b.imageObjectKey
  )
}

/**
 * The draft `imageObjectKey` field for the compose image state. A server image
 * (uploaded through POST /posts/images) is saved by key, a removed image clears
 * it, and a local image whose upload is still pending leaves the stored value
 * untouched until the upload returns a key.
 */
export function draftImageField(
  image:
    | { kind: 'none' }
    | { kind: 'server'; objectKey: string; width?: number | null; height?: number | null }
    | { kind: 'local' },
): { imageObjectKey?: string | null; imageWidth?: number | null; imageHeight?: number | null } {
  if (image.kind === 'server') {
    // The size rides along only when known, so an old draft keeps its stored one.
    return image.width && image.height
      ? { imageObjectKey: image.objectKey, imageWidth: image.width, imageHeight: image.height }
      : { imageObjectKey: image.objectKey }
  }
  if (image.kind === 'none') return { imageObjectKey: null }
  return {}
}

/** Append a page of drafts, skipping any id already listed. */
export function appendDraftPage(current: ComposeDraft[], page: ComposeDraft[]): ComposeDraft[] {
  const seen = new Set(current.map((d) => d.id))
  return [...current, ...page.filter((d) => !seen.has(d.id))]
}

/** Where the private image of a saved draft is served from (owner only). */
export function draftImagePath(draftId: string): `/${string}` {
  return `/posts/images?draftId=${encodeURIComponent(draftId)}`
}

/**
 * A stable, collision-resistant idempotency key for a publish attempt. Matches
 * the server's `/^[\w-]{12,128}$/` id format so it can also become the post id.
 */
export function generateClientPostId(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2).padEnd(24, '0')
  return `cpost-${rand}`.slice(0, 128)
}

/** Why an edit save (image upload or PATCH) failed, as the edit screen shows it. */
export type EditSaveError = 'failed' | 'conflict' | 'restricted'

/**
 * 409 = the post was edited elsewhere (reload, no retry of the stale edit);
 * 403 account_restricted = the moderation notice; anything else = generic.
 */
export async function editSaveError(res: Response): Promise<EditSaveError> {
  if (res.status === 409) return 'conflict'
  if (await isAccountRestrictedResponse(res)) return 'restricted'
  return 'failed'
}
