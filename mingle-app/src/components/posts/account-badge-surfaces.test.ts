import { readFileSync } from 'node:fs'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { FeedPostDto } from '@/lib/feed-post-dto'
import { feedCopy } from '@/i18n/feed-copy'
import FeedPostCard from '@/components/feed/feed-post-card'
import { PersonRow } from '@/components/search/people-follow'
import CommentItem, { type CommentItemHandlers } from '@/components/comments/comment-item'
import type { CommentNode } from '@/components/comments/comment-types'
import ProfileLinkInstallScreen from '@/components/profile-link-install-screen'

type Flags = { isOfficial?: boolean }

const noop = () => {}

/** The markup of the first <button> whose attributes contain `marker`. */
function buttonWith(html: string, marker: string): string {
  const start = html.lastIndexOf('<button', html.indexOf(marker))
  return html.slice(start, html.indexOf('</button>', start) + '</button>'.length)
}

const render = (element: ReactElement) => renderToStaticMarkup(element)

describe('feed card author (home feed, author / search viewer, deep-linked post)', () => {
  function renderCard(flags: Flags) {
    const post: FeedPostDto = {
      id: 'p1',
      author: { id: 'u1', handle: 'mina', name: 'Mina', imageUrl: null, ...flags },
      sourceText: 'Hello',
      sourceLanguage: 'en',
      bodyVersion: 1,
      displayText: null,
      displayLanguage: null,
      translationState: 'same_language',
      backgroundKey: 'warm-cream',
      image: null,
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      followingAuthor: false,
      isMine: false,
      publishedAt: '2026-09-30T00:00:00.000Z',
      visibility: 'public',
      deletedAt: null,
    }
    return render(createElement(FeedPostCard, {
      post,
      cardHeight: '100dvh',
      locale: 'ko',
      copy: feedCopy('ko'),
      viewerId: 'viewer',
      viewerLanguage: 'ko',
      reducedMotion: true,
      onRequireLogin: noop,
      onOpenComments: noop,
      onOpenActions: noop,
      onOpenAuthor: noop,
      onOpenImage: noop,
      onLikeChange: noop,
      onFollowed: noop,
      onToast: noop,
    }))
  }

  it('keeps the official chip inside the profile button, as before', () => {
    const html = renderCard({ isOfficial: true })
    expect(buttonWith(html, 'aria-label="Mina (공식)"')).toContain('data-account-badge="official"')
  })

  it('shows no badge for an ordinary member', () => {
    const html = renderCard({})
    expect(html).not.toContain('data-account-badge')
    expect(html).toContain('aria-label="Mina"')
  })
})

describe('people search row (unified search, people screen)', () => {
  function renderPerson(flags: Flags) {
    return render(createElement('ul', null, createElement(PersonRow, {
      person: { id: 'u1', handle: 'mina.park', name: 'Mina', image: null, isFollowing: false, ...flags },
      labels: { userFallback: 'Mingle 사용자', follow: '팔로우', following: '팔로잉' },
      onOpen: noop,
      canFollow: true,
      isFollowPending: false,
      onToggleFollow: noop,
      locale: 'ko',
    })))
  }

  it('keeps the official chip as pass-through content (a tap opens the profile, as before)', () => {
    const html = renderPerson({ isOfficial: true })
    expect(html).toContain('aria-label="Mina (공식), @mina.park"')
    expect(html).toContain('data-account-badge="official"')
    expect(html).toContain('pointer-events-none')
  })

  it('shows no badge for an ordinary member', () => {
    expect(renderPerson({})).not.toContain('data-account-badge')
  })
})

describe('comment author and "replying to" label', () => {
  const handlers: CommentItemHandlers = {
    onToggleLike: noop,
    onStartReply: noop,
    onEdit: noop,
    onDelete: noop,
    onReport: noop,
    onToggleTranslation: noop,
    onRetryFailed: noop,
    onDiscardFailed: noop,
  }

  function renderComment(authorFlags: Flags, replyToFlags: Flags) {
    const comment: CommentNode = {
      id: 'c2',
      postId: 'p1',
      authorId: 'u1',
      parentId: 'c1',
      replyToUserId: 'u2',
      bodyVersion: 1,
      sourceText: 'Welcome!',
      sourceLanguage: 'en',
      displayText: 'Welcome!',
      displayLanguage: 'en',
      translationState: 'same_language',
      likeCount: 0,
      isDeleted: false,
      edited: false,
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
      author: { id: 'u1', handle: 'mina', name: 'Mina', image: null, ...authorFlags },
      replyToUser: { id: 'u2', handle: 'jun', name: 'Jun', ...replyToFlags },
      replyCount: 0,
      liked: false,
    }
    return render(createElement(CommentItem, {
      comment,
      isReply: true,
      locale: 'ko',
      viewerId: 'viewer',
      postAuthorId: 'author',
      viewerLanguage: 'en',
      handlers,
    }))
  }

  it('keeps the official author chip and adds nothing for members', () => {
    expect(renderComment({ isOfficial: true }, {})).toContain('data-account-badge="official"')
    expect(renderComment({}, {})).not.toContain('data-account-badge')
  })
})

describe('/p/{userId} link preview', () => {
  function renderLink(flags: Flags) {
    return render(createElement(ProfileLinkInstallScreen, {
      userId: 'user_123',
      locale: 'ko',
      iosAppStoreUrl: 'https://apps.apple.com/app/id1',
      androidPlayStoreUrl: 'https://play.google.com/store/apps/details?id=x',
      profile: { name: 'Mina', handle: 'mina', image: 'https://cdn/m.png', imageCropScale: 1, imageCropX: 0, imageCropY: 0, ...flags },
    }))
  }

  it('shows no badge for an ordinary member', () => {
    expect(renderLink({})).not.toContain('data-account-badge')
  })
})

describe('the other identity surfaces render the badge through the one rule', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
  const surfaces: Array<[surface: string, path: string, rowAction: boolean]> = [
    ['public profile header, title and photo preview', '../public-user-profile-screen.tsx', false],
    ['notifications actor', '../notification-panel.tsx', true],
    ['followers / following list', '../follow-list-screen.tsx', true],
    ['invite / new group / add members list and picked chips', '../invite-friends-screen.tsx', true],
    ['blocked users and my reports', '../my-page.tsx', true],
  ]

  it.each(surfaces)('%s', (_surface, path, rowAction) => {
    const source = read(path)
    expect(source).toContain('import AccountBadge from "@/components/posts/account-badge"')
    expect(source).toMatch(/resolveAccountBadge\(/)
    expect(source).toMatch(/withAccountBadgeLabel\(/)
    // A row whose whole area is one action keeps the badge its own button.
    if (rowAction) expect(source).toContain('<IdentityRow')
  })

  it('no longer ships the official-only badge', () => {
    for (const [, path] of surfaces) expect(read(path)).not.toContain('official-badge')
  })
})
