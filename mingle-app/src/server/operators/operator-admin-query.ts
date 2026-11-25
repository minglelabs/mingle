import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { sameBioLanguage } from '@/lib/profile-bio'
import { buildProfileLinkPath } from '@/lib/profile-link'
import { isOperatorBioPending } from './bio-queue'
import { findOperatorAccount } from './operator-guard'
import { zipInterestLanguages, type InterestLanguage } from '@/lib/interest-languages'
import { ageOn } from '@/server/operator-auto-reply/generate'

/** Staff-only reads for the admin operator pages. Never serialized to app users. */

export const OPERATOR_LIST_PAGE_SIZE = 30

export type OperatorListItem = {
  id: string
  handle: string
  name: string | null
  image: string | null
  personaCountry: string | null
  primaryLanguage: string | null
  isActive: boolean
  isOperator: boolean
  createdAt: string
  /** For the big card: what the profile shows. */
  bio: string | null
  age: number | null
  gender: string | null
  city: string | null
  primaryLanguages: string[]
  interestLanguages: InterestLanguage[]
  /** Posts that are up (not deleted). */
  postCount: number
  /** An operator account's review state (approved = live); null for a real user. */
  reviewState: string | null
}

/**
 * Which accounts the 계정 tab lists: everyone (default), only operator
 * accounts, operator accounts up in the app (approved and active), operator
 * accounts still in review (not approved yet), or only real users.
 */
export type AccountListScope = 'all' | 'operator' | 'live' | 'review' | 'user'

const SCOPES: readonly AccountListScope[] = ['all', 'operator', 'live', 'review', 'user']

export function parseAccountListScope(value: unknown): AccountListScope {
  return SCOPES.includes(value as AccountListScope) ? (value as AccountListScope) : 'all'
}

function scopeWhere(scope: AccountListScope): Prisma.UserWhereInput {
  switch (scope) {
    case 'operator': return { isOperator: true }
    case 'live': return { isOperator: true, isActive: true, operatorAccount: { is: { reviewState: 'approved' } } }
    case 'review': return { isOperator: true, operatorAccount: { is: { reviewState: { not: 'approved' } } } }
    case 'user': return { isOperator: false }
    default: return {}
  }
}

export type OperatorListPage = {
  items: OperatorListItem[]
  total: number
  page: number
  pageCount: number
  query: string
  scope: AccountListScope
}

export function normalizeOperatorSearch(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/^@+/, '').slice(0, 60) : ''
}

/** The 계정 tab's list: every account (operator or real user) by default, newest first, searchable. */
export async function listOperatorAccounts(args: { query?: string; page?: number; scope?: AccountListScope } = {}): Promise<OperatorListPage> {
  const query = normalizeOperatorSearch(args.query)
  const scope = args.scope ?? 'all'
  const where: Prisma.UserWhereInput = {
    ...scopeWhere(scope),
    isDeleted: false,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { handle: { contains: query.toLowerCase() } },
            // Real users are often found by their sign-in email.
            ...(query.includes('@') || query.includes('.') ? [{ email: { contains: query, mode: 'insensitive' as const } }] : []),
          ],
        }
      : {}),
  }
  const total = await prisma.user.count({ where })
  const pageCount = Math.max(1, Math.ceil(total / OPERATOR_LIST_PAGE_SIZE))
  const page = Math.min(Math.max(1, Math.floor(args.page ?? 1) || 1), pageCount)
  const rows = total === 0 ? [] : await prisma.user.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * OPERATOR_LIST_PAGE_SIZE,
    take: OPERATOR_LIST_PAGE_SIZE,
    select: {
      id: true,
      handle: true,
      name: true,
      image: true,
      primaryLanguages: true,
      isActive: true,
      isOperator: true,
      createdAt: true,
      locationCountry: true,
      locationCity: true,
      bio: true,
      birthDate: true,
      gender: true,
      interestLanguages: true,
      interestLanguageLevels: true,
      operatorAccount: { select: { personaCountry: true, reviewState: true } },
      _count: { select: { posts: { where: { isDeleted: { not: true } } } } },
    },
  })
  return {
    items: rows.map(row => ({
      id: row.id,
      handle: row.handle,
      name: row.name,
      image: row.image,
      personaCountry: row.operatorAccount?.personaCountry ?? row.locationCountry ?? null,
      primaryLanguage: row.primaryLanguages[0] ?? null,
      isActive: row.isActive,
      isOperator: row.isOperator,
      createdAt: row.createdAt.toISOString(),
      bio: row.bio?.trim() || null,
      age: ageOn(row.birthDate, new Date()),
      gender: row.gender ?? null,
      city: row.locationCity ?? null,
      primaryLanguages: row.primaryLanguages,
      interestLanguages: zipInterestLanguages(row.interestLanguages, row.interestLanguageLevels),
      postCount: row._count.posts,
      reviewState: row.operatorAccount?.reviewState ?? null,
    })),
    total,
    page,
    pageCount,
    query,
    scope,
  }
}

export type OperatorBioStatus =
  /** No bio. */
  | 'none'
  /** Waiting in the bio queue (written soon) or being translated. */
  | 'pending'
  | 'translated'
  /** Saved, but the automatic translations did not all succeed (viewers can still translate on demand). */
  | 'partial'

export type OperatorAccountDetail = {
  id: string
  handle: string
  name: string | null
  image: string | null
  bio: string
  bioStatus: OperatorBioStatus
  bioLanguages: string[]
  primaryLanguage: string | null
  interestLanguages: InterestLanguage[]
  birthYear: number | null
  /** 'female' | 'male', or null when the account has none. */
  gender: string | null
  personaCountry: string | null
  city: string | null
  countryName: string | null
  notes: string | null
  isActive: boolean
  createdAt: string
  profilePath: string | null
}

async function readBioStatus(userId: string, bio: string | null): Promise<{ status: OperatorBioStatus; languages: string[] }> {
  if (isOperatorBioPending(userId)) return { status: 'pending', languages: [] }
  if (!bio) return { status: 'none', languages: [] }
  const state = await prisma.profileBioState.findUnique({ where: { userId }, select: { currentVersionId: true } })
  if (!state?.currentVersionId) return { status: 'partial', languages: [] }
  const version = await prisma.profileBioVersion.findUnique({
    where: { id: state.currentVersionId },
    select: { status: true, sourceLanguage: true, targetLanguages: true, translations: { select: { language: true, status: true } } },
  })
  if (!version) return { status: 'partial', languages: [] }
  const languages = version.translations
    .filter(row => row.status === 'succeeded' && version.targetLanguages.includes(row.language))
    .map(row => row.language)
  if (version.status !== 'complete') return { status: 'pending', languages }
  const expected = version.sourceLanguage
    ? version.targetLanguages.filter(language => !sameBioLanguage(version.sourceLanguage, language))
    : version.targetLanguages
  const translated = expected.length > 0 && expected.every(language => languages.includes(language))
  return { status: translated ? 'translated' : 'partial', languages }
}

/** The account for the admin detail page / GET endpoint, or null unless it is an operator account. */
export async function getOperatorAccountDetail(userId: string): Promise<OperatorAccountDetail | null> {
  const operator = await findOperatorAccount(userId)
  if (!operator) return null
  const row = await prisma.user.findUnique({
    where: { id: operator.id },
    select: {
      id: true,
      handle: true,
      name: true,
      image: true,
      bio: true,
      primaryLanguages: true,
      interestLanguages: true,
      interestLanguageLevels: true,
      birthDate: true,
      gender: true,
      locationCity: true,
      locationCountry: true,
      isActive: true,
      createdAt: true,
      operatorAccount: { select: { personaCountry: true, notes: true } },
    },
  })
  if (!row) return null
  const bio = await readBioStatus(row.id, row.bio)
  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    image: row.image,
    bio: row.bio ?? '',
    bioStatus: bio.status,
    bioLanguages: bio.languages,
    primaryLanguage: row.primaryLanguages[0] ?? null,
    interestLanguages: zipInterestLanguages(row.interestLanguages, row.interestLanguageLevels),
    birthYear: row.birthDate ? row.birthDate.getUTCFullYear() : null,
    gender: row.gender,
    personaCountry: row.operatorAccount?.personaCountry ?? null,
    city: row.locationCity,
    countryName: row.locationCountry,
    notes: row.operatorAccount?.notes ?? null,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    profilePath: buildProfileLinkPath(row.id),
  }
}
