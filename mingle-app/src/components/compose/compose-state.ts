/**
 * Shared types + small pure helpers for the compose surface.
 * Kept framework-agnostic so they can be unit-tested without React.
 */

/** A draft as returned by GET/POST/PATCH /posts/drafts. */
export type ComposeDraft = {
  id: string
  sourceText: string | null
  backgroundKey: string | null
  imageObjectKey: string | null
  updatedAt: string
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
  image: { kind: 'none' } | { kind: 'server'; objectKey: string } | { kind: 'local' },
): { imageObjectKey?: string | null } {
  if (image.kind === 'server') return { imageObjectKey: image.objectKey }
  if (image.kind === 'none') return { imageObjectKey: null }
  return {}
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
