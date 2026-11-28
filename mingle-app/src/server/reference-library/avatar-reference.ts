import { loadAvatarPersona, type AvatarReference } from '@/server/operator-avatars/generate'
import type { ReferenceAttributes } from './classify'
import { referenceNeedLabel, referencePersonaFit, referenceSeasonClashes, referenceSeasonsToAvoid } from './direction'
import { claimReferencePhoto, listReferencePhotos, loadReferenceBytes, referenceKindOf, releaseReferencePhoto, type ReferenceGender, type ReferenceKind, type ReferencePhoto } from './library'

/** A profile photo is drawn from a library shot of one person: face shown, or not. */
// A profile photo always shows a face (staff, 2026-11-28): a photo without one is for posts only.
const AVATAR_KINDS: readonly ReferenceKind[] = ['face']

export type AvatarLibraryReference = { reference: AvatarReference; kind: ReferenceKind; note?: string | null; attributes?: ReferenceAttributes | null }

/**
 * 레퍼런스로 재제작 of a profile photo in the review tool: claims an unused
 * library photo that suits the account (one person, its gender, about its
 * age and look, not the opposite season to now where it lives). When none
 * fits, says in Korean which photo staff should upload.
 */
export async function claimAvatarReference(userId: string): Promise<
  | { ok: true; id: string; libraryReference: AvatarLibraryReference }
  | { ok: false; need: string }
> {
  const persona = await loadAvatarPersona(userId)
  if (!persona) return { ok: false, need: '운영 계정이 아니에요' }
  const gender: ReferenceGender | null = persona.gender === 'female' || persona.gender === 'male' ? persona.gender : null
  const avoid = referenceSeasonsToAvoid(persona.country)
  const skip = (item: ReferencePhoto) => referenceSeasonClashes(item.attributes, avoid) || referencePersonaFit(item.attributes, persona, referenceKindOf(item)) === 'mismatch'
  const prefer = (item: ReferencePhoto) => referencePersonaFit(item.attributes, persona, referenceKindOf(item)) === 'match'
  const need = referenceNeedLabel(AVATAR_KINDS, gender, persona)
  const photo = await claimReferencePhoto({ userId, kind: 'avatar', kinds: AVATAR_KINDS, gender, skip, prefer }).catch(() => null)
  if (!photo) return { ok: false, need }
  try {
    const bytes = await loadReferenceBytes(photo)
    return { ok: true, id: photo.id, libraryReference: { reference: bytes, kind: referenceKindOf(photo), note: photo.note, attributes: photo.attributes } }
  } catch {
    await releaseReferencePhoto(photo.id).catch(() => {})
    return { ok: false, need }
  }
}

/** The library photo each of these accounts' profile photos was drawn from (current or waiting for review). */
export async function avatarReferencesByUser(userIds: readonly string[]): Promise<Map<string, { id: string; objectKey: string; at: string }>> {
  const wanted = new Set(userIds)
  const byUser = new Map<string, { id: string; objectKey: string; at: string }>()
  if (!wanted.size) return byUser
  for (const photo of await listReferencePhotos().catch(() => [])) {
    const use = photo.usedBy
    if (use?.kind !== 'avatar' || !wanted.has(use.userId)) continue
    // The latest use wins (an account redrawn from the library again).
    const seen = byUser.get(use.userId)
    if (!seen || seen.at < use.at) byUser.set(use.userId, { id: photo.id, objectKey: photo.objectKey, at: use.at })
  }
  return byUser
}

/** Frees the account's other profile-photo uses once a new library photo is its profile photo. */
export async function releaseOtherAvatarReferences(userId: string, keepId: string): Promise<void> {
  const others = (await listReferencePhotos()).filter((photo) => photo.id !== keepId && photo.usedBy?.kind === 'avatar' && photo.usedBy.userId === userId)
  for (const photo of others) await releaseReferencePhoto(photo.id)
}
