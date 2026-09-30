import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/server/profile-bio', () => ({ getPublishedBioText: async (_id: string, bio: string | null) => bio }))

import { FEED_PAGE_SELECT } from '@/server/feed/feed-service'
import { feedPostRowSelect } from '@/server/feed/feed-post-loader'
import { serializeFeedPost, type SerializerContext } from '@/server/posts/feed-post-serializer'
import { serializeUserProfile, userProfileSelect } from '@/server/user-profile'
import { buildNotificationListResponse } from '@/server/notifications/notification-list'
import { USER_IDENTITY_SELECT } from './user-identity-select'
import { serializeListUserIdentity } from './list-user-identity'

/**
 * Contract for every non-chat surface that shows another user's name
 * (research-B B6 rows 1-8 and 16-18): its identity select reads BOTH badge
 * flags, and its serializer sends `isOperator: true` for an operator account
 * and nothing for anyone else. A select or serializer that drops the flag
 * fails here before an operator account can show up unlabeled.
 *
 * The route handlers that hand `USER_IDENTITY_SELECT` straight to Prisma
 * (public profile, people search, comments, notifications, follow / invite
 * lists, blocked users, my reports) are pinned to it in their own route tests.
 */

type Flags = { isOfficial?: boolean | null; isOperator?: boolean | null }

const identitySelects: Array<[surface: string, select: Record<string, unknown>]> = [
  ['home feed card author', FEED_PAGE_SELECT.author.select],
  ['profile grid / post search / archive / hidden / deep-linked post author', feedPostRowSelect.author.select],
  ['own profile and the /p/{userId} link preview', userProfileSelect],
  [
    'public profile, people search, comment author + "replying to", notification actor, '
      + 'followers / following / invite lists, blocked users, my reports',
    USER_IDENTITY_SELECT,
  ],
]

const ctx: SerializerContext = {
  viewerId: 'viewer',
  displayLanguage: null,
  likedPostIds: new Set(),
  followedAuthorIds: new Set(),
  translationByPostId: new Map(),
  includeDeletedAt: false,
}

const identity = { id: 'u1', handle: 'mina', name: 'Mina', image: null }

const serializers: Array<[surface: string, serialize: (flags: Flags) => object]> = [
  [
    'feed post author (every post list and the single post)',
    (flags) => serializeFeedPost({
      id: 'p1', authorId: 'u1', bodyVersion: 1, sourceText: 'Hi', sourceLanguage: 'en', backgroundKey: null,
      imageObjectKey: null, visibility: 'public', deletedAt: null, likeCount: 0, commentCount: 0,
      publishedAt: new Date('2026-09-30T00:00:00.000Z'), author: { ...identity, ...flags },
    }, ctx).author,
  ],
  [
    'own profile and the /p/{userId} link preview',
    (flags) => serializeUserProfile({
      ...identity, imageObjectKey: null, imageCropScale: null, imageCropX: null, imageCropY: null, bio: null,
      nationality: null, primaryLanguages: [], defaultConversationLanguages: [], locationLatitude: null,
      locationLongitude: null, locationCity: null, locationCountry: null, locationCountryCode: null,
      _count: { followerRelations: 0, followingRelations: 0 }, ...flags,
    }),
  ],
  [
    'list rows (comment author, follow / invite lists, blocked users, my reports)',
    (flags) => serializeListUserIdentity({ ...identity, ...flags }),
  ],
  [
    'notification actor',
    (flags) => buildNotificationListResponse([{
      id: 'n1', type: 'follow', postId: null, commentId: null, readAt: null,
      createdAt: new Date('2026-09-30T00:00:00.000Z'), actor: { ...identity, ...flags },
    }]).items[0].actors[0],
  ],
]

describe('identity surfaces contract: selects', () => {
  it.each(identitySelects)('%s reads isOperator and isOfficial', (_surface, select) => {
    expect(select).toMatchObject({ isOperator: true, isOfficial: true })
  })
})

describe('identity surfaces contract: serializers', () => {
  it.each(serializers)('%s sends isOperator for an operator account only', (_surface, serialize) => {
    const operator = serialize({ isOfficial: false, isOperator: true })
    expect(operator).toMatchObject({ isOperator: true })
    expect(operator).not.toHaveProperty('isOfficial')
  })

  it.each(serializers)('%s keeps the official flag for the official account', (_surface, serialize) => {
    const official = serialize({ isOfficial: true, isOperator: false })
    expect(official).toMatchObject({ isOfficial: true })
    expect(official).not.toHaveProperty('isOperator')
  })

  it.each(serializers)('%s adds no flag for an ordinary member', (_surface, serialize) => {
    for (const flags of [{ isOfficial: false, isOperator: false }, { isOfficial: null, isOperator: null }, {}]) {
      const member = serialize(flags)
      expect(member).not.toHaveProperty('isOperator')
      expect(member).not.toHaveProperty('isOfficial')
    }
  })
})
