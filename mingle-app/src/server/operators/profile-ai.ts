import { prisma } from '@/lib/prisma'
import { canonicalizeSttLanguageCode, sanitizeSttLanguageSelection } from '@/lib/stt-languages'
import type { InterestLanguage } from '@/lib/interest-languages'
import { learnerPlan, randomLearnerDots } from '@/server/operator-post-reserve/poster-profile'
import { generatePersonaDrafts } from './persona-draft'
import { PERSONA_MAX_AGE, PERSONA_MIN_AGE } from './persona-rules'

/**
 * AI help in the operator editor. Staff ask for a new bio, or a new
 * everything-but-bio-and-photo, or both; the answer only fills the form and
 * nothing is saved until staff press save. Country, gender and own language
 * stay, so the profile photo still fits the person.
 */
export const PROFILE_AI_SCOPES = ['bio', 'profile', 'all'] as const
export type ProfileAiScope = (typeof PROFILE_AI_SCOPES)[number]

export type ProfileAiDraft = {
  bio?: string
  name?: string
  handle?: string
  city?: string
  birthYear?: number
  interestLanguages?: InterestLanguage[]
}

export type ProfileAiResult =
  | { ok: true; draft: ProfileAiDraft }
  | { ok: false; error: 'operator_not_found' | 'no_persona' | 'draft_failed' }

export function parseProfileAiScope(value: unknown): ProfileAiScope | null {
  return PROFILE_AI_SCOPES.includes(value as ProfileAiScope) ? (value as ProfileAiScope) : null
}

/** The age span a new profile may move within: a few years around the current age. */
const AGE_SPREAD = 3

export async function draftOperatorProfile(userId: string, scope: ProfileAiScope, options: { now?: Date; random?: () => number } = {}): Promise<ProfileAiResult> {
  const now = options.now ?? new Date()
  const random = options.random ?? Math.random
  const user = await prisma.user.findFirst({
    where: { id: userId, isOperator: true, isDeleted: false },
    select: { name: true, handle: true, birthDate: true, locationCity: true, primaryLanguages: true, operatorAccount: { select: { personaCountry: true, personaGender: true } } },
  })
  if (!user) return { ok: false, error: 'operator_not_found' }
  const country = user.operatorAccount?.personaCountry
  if (!country) return { ok: false, error: 'no_persona' }

  const birthYear = user.birthDate ? user.birthDate.getUTCFullYear() : null
  const age = birthYear ? now.getUTCFullYear() - birthYear : 27
  const gender = user.operatorAccount?.personaGender
  const keepPlace = scope === 'bio'
  try {
    const { drafts } = await generatePersonaDrafts({
      count: 1,
      countries: [country],
      ageMin: Math.max(PERSONA_MIN_AGE, age - AGE_SPREAD),
      ageMax: Math.min(PERSONA_MAX_AGE, age + AGE_SPREAD),
      genderMix: gender === 'female' || gender === 'male' ? gender : 'any',
      avoidNames: user.name ? [user.name] : [],
      avoidHandles: [user.handle],
      ...(keepPlace ? { pin: { city: user.locationCity, birthYear } } : {}),
    }, { random, now })
    const draft = drafts[0]
    if (!draft) return { ok: false, error: 'draft_failed' }
    if (scope === 'bio') return { ok: true, draft: { bio: draft.bio } }

    const native = sanitizeSttLanguageSelection(user.primaryLanguages)[0] ?? draft.primaryLanguage
    const learning = canonicalizeSttLanguageCode(learnerPlan(userId, native).language)
    const interestLanguages: InterestLanguage[] = learning && learning !== canonicalizeSttLanguageCode(native)
      ? [{ code: learning, level: randomLearnerDots(random) }]
      : []
    const rest: ProfileAiDraft = { name: draft.name, handle: draft.handle, city: draft.city, birthYear: draft.birthYear, interestLanguages }
    return { ok: true, draft: scope === 'all' ? { ...rest, bio: draft.bio } : rest }
  } catch (error) {
    console.warn('[operator-profile-ai] draft_failed', { scope, error: error instanceof Error ? error.name : 'unknown' })
    return { ok: false, error: 'draft_failed' }
  }
}
