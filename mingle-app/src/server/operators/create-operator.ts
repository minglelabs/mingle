import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { deriveDefaultConversationLanguages, sanitizeSttLanguageSelection } from '@/lib/stt-languages'
import { NEW_REGISTERED_USER_TRANSLATION_MODEL } from '@/lib/translation-models'
import type { AdminContext } from '@/server/admin/guard'
import { writeAdminAudit } from '@/server/admin/audit'
import { updateProfileWithBio } from '@/server/profile-bio'
import { enqueueOperatorBioRun, enqueueOperatorBioWrite } from './bio-queue'
import { requireOperatorAccount } from './operator-guard'
import { createWithOperatorHandle, isHandleConflictError } from './operator-handles'
import {
  PERSONA_MIN_AGE,
  personaLocationFields,
  validatePersonaDraft,
  validateOperatorNotes,
  type OperatorPatch,
  type PersonaDraft,
  type PersonaFieldError,
} from './persona-rules'

/**
 * Operator accounts are created with a direct `prisma.user.create` (contract
 * §5): no email, password, external id, OAuth link or push token, so nothing
 * can sign in as them, and no signup side effects (no welcome DM or mutual
 * follow from `ensureSignupWelcomeOnboarding`, no analytics). `isOperator` is
 * always true and `isOfficial` always false. Every write is audited.
 */

type Random = () => number

const DAY_MS = 86_400_000

export class OperatorDraftInvalidError extends Error {
  readonly errors: PersonaFieldError[]

  constructor(errors: PersonaFieldError[]) {
    super('operator_draft_invalid')
    this.name = 'OperatorDraftInvalidError'
    this.errors = errors
  }
}

export class OperatorHandleTakenError extends Error {
  constructor() {
    super('operator_handle_taken')
    this.name = 'OperatorHandleTakenError'
  }
}

/**
 * A birth date in `birthYear` (the persona's age is never shown, but the
 * column is stored like any user's). A persona who turns 20 this year gets a
 * birthday no later than today, so it is at least 20 on every date.
 */
export function birthDateFromYear(birthYear: number, now = new Date(), random: Random = Math.random): Date {
  const start = Date.UTC(birthYear, 0, 1)
  const latestAdult = Date.UTC(now.getUTCFullYear() - PERSONA_MIN_AGE, now.getUTCMonth(), now.getUTCDate())
  const end = Math.min(Date.UTC(birthYear, 11, 31), latestAdult)
  if (end < start) throw new Error('invalid_birth_year')
  const days = Math.round((end - start) / DAY_MS)
  return new Date(start + Math.min(days, Math.floor(random() * (days + 1))) * DAY_MS)
}

/** Languages derived from the primary language the way email signup does (signup/route.ts). */
export function operatorLanguageFields(primaryLanguage: string) {
  const primaryLanguages = sanitizeSttLanguageSelection([primaryLanguage])
  return {
    nationality: primaryLanguages[0] ?? null,
    primaryLanguages,
    defaultConversationLanguages: deriveDefaultConversationLanguages(primaryLanguages),
    defaultDisplayLanguage: primaryLanguages[0] ?? null,
  }
}

/** City-center location (already 2 dp), stamped as a normal verified location. */
export function operatorLocationFields(
  location: Pick<PersonaDraft, 'personaCountry' | 'city' | 'countryName' | 'latitude' | 'longitude'>,
  now: Date,
) {
  return {
    locationLatitude: Math.round(location.latitude * 100) / 100,
    locationLongitude: Math.round(location.longitude * 100) / 100,
    locationCity: location.city,
    locationCountry: location.countryName,
    locationCountryCode: location.personaCountry.toLowerCase(),
    locationUpdatedAt: now,
    locationPermissionVerifiedAt: now,
  }
}

export type CreatedOperatorAccount = {
  userId: string
  handle: string
  /** The handle in the draft; differs from `handle` when it was taken and got a suffix. */
  requestedHandle: string
  /** The bio waits in the bio queue (see bio-queue.ts). */
  bioQueued: boolean
}

export async function createOperatorAccount(
  ctx: AdminContext,
  input: PersonaDraft,
  options: { notes?: string | null; now?: Date; random?: Random } = {},
): Promise<CreatedOperatorAccount> {
  const now = options.now ?? new Date()
  const random = options.random ?? Math.random
  const checked = validatePersonaDraft(input, { now })
  const notes = validateOperatorNotes(options.notes)
  if (!checked.ok || !notes.ok) {
    throw new OperatorDraftInvalidError([
      ...(checked.ok ? [] : checked.errors),
      ...(notes.ok ? [] : [{ field: 'notes' as const, error: notes.error }]),
    ])
  }
  const draft = checked.draft

  const user = await createWithOperatorHandle(draft.handle, handle => prisma.user.create({
    data: {
      handle,
      name: draft.name,
      isOperator: true,
      isOfficial: false,
      translationModel: NEW_REGISTERED_USER_TRANSLATION_MODEL,
      ...operatorLanguageFields(draft.primaryLanguage),
      birthDate: birthDateFromYear(draft.birthYear, now, random),
      ...operatorLocationFields(draft, now),
      operatorAccount: {
        create: {
          personaCountry: draft.personaCountry,
          notes: notes.value,
          createdBySessionId: ctx.sessionId,
        },
      },
    },
    select: { id: true, handle: true },
  }), random)

  await writeAdminAudit(ctx, {
    action: 'operator.create',
    operatorUserId: user.id,
    targetType: 'user',
    targetId: user.id,
    metadata: {
      handle: user.handle,
      requestedHandle: draft.handle,
      personaCountry: draft.personaCountry,
      city: draft.city,
      primaryLanguage: draft.primaryLanguage,
      birthYear: draft.birthYear,
      gender: draft.gender ?? null,
      hasBio: Boolean(draft.bio),
    },
  })

  if (draft.bio) enqueueOperatorBioWrite(user.id, draft.bio)
  return { userId: user.id, handle: user.handle, requestedHandle: draft.handle, bioQueued: Boolean(draft.bio) }
}

export type OperatorPatchField = 'name' | 'handle' | 'bio' | 'primaryLanguage' | 'birthYear' | 'location' | 'notes'

/** Applies a validated patch (`parseOperatorPatch`) to an operator account. Refuses anything else. */
export async function updateOperatorAccount(
  ctx: AdminContext,
  userId: string,
  patch: OperatorPatch,
  options: { now?: Date; random?: Random } = {},
): Promise<{ changed: OperatorPatchField[] }> {
  const account = await requireOperatorAccount(userId)
  const now = options.now ?? new Date()
  const changed: OperatorPatchField[] = []
  const userData: Prisma.UserUpdateInput = {}
  const accountData: { personaCountry?: string; notes?: string | null } = {}

  if (patch.name !== undefined) {
    userData.name = patch.name
    changed.push('name')
  }
  if (patch.handle !== undefined) {
    userData.handle = patch.handle
    changed.push('handle')
  }
  if (patch.primaryLanguage !== undefined) {
    Object.assign(userData, operatorLanguageFields(patch.primaryLanguage))
    changed.push('primaryLanguage')
  }
  if (patch.birthYear !== undefined) {
    userData.birthDate = birthDateFromYear(patch.birthYear, now, options.random)
    changed.push('birthYear')
  }
  if (patch.location) {
    Object.assign(userData, operatorLocationFields(personaLocationFields(patch.location), now))
    accountData.personaCountry = patch.location.country.code
    changed.push('location')
  }
  if (patch.bio !== undefined) {
    userData.bio = patch.bio
    changed.push('bio')
  }
  if (patch.notes !== undefined) {
    accountData.notes = patch.notes
    changed.push('notes')
  }
  if (!changed.length) return { changed }

  let versionId: string | null
  try {
    ({ versionId } = await updateProfileWithBio(userId, patch.bio, async tx => {
      if (Object.keys(userData).length) {
        await tx.user.update({ where: { id: userId }, data: userData, select: { id: true } })
      }
      if (Object.keys(accountData).length) {
        await tx.operatorAccount.upsert({ where: { userId }, create: { userId, ...accountData }, update: accountData })
      }
    }))
  } catch (error) {
    if (patch.handle !== undefined && isHandleConflictError(error)) throw new OperatorHandleTakenError()
    throw error
  }
  if (versionId) enqueueOperatorBioRun(versionId, userId)

  await writeAdminAudit(ctx, {
    action: 'operator.update',
    operatorUserId: userId,
    targetType: 'user',
    targetId: userId,
    metadata: {
      fields: changed,
      ...(patch.handle !== undefined && patch.handle !== account.handle ? { handle: patch.handle, previousHandle: account.handle } : {}),
    },
  })
  return { changed }
}
