import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ReviewItem } from '@/server/operator-review/review'

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/operators/review',
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}))

import { ReviewBoard } from './review-board'

const profileItem: ReviewItem = {
  kind: 'profile',
  key: 'k-profile',
  at: '2026-11-22T14:04:00.000Z',
  pinned: false,
  profile: {
    userId: 'u1', name: '민아', handle: 'mina', image: null, bio: '안녕하세요', age: 27, city: 'Seoul', country: 'KR',
    primaryLanguages: ['ko'], interestLanguages: [], personaGender: 'female', profileState: 'pending', profileFeedback: null, candidate: null,
  },
}

const postItem: ReviewItem = {
  kind: 'post',
  key: 'k-post',
  at: '2026-11-22T14:05:00.000Z',
  fromReference: false,
  pinned: true,
  author: { userId: 'u1', name: '민아', handle: 'mina', image: null, primaryLanguages: ['ko'], interestLanguages: [], profileState: 'pending' },
  post: {
    id: 'p1', text: '오늘 한강 산책', language: 'ko', topic: null, state: 'review', photoKind: null, photoDescription: null,
    imageObjectKey: null, imageWidth: null, imageHeight: null, extraImages: [], reviewFeedback: null, error: null,
    photoRequested: false, photoDrawing: false, rewriting: false, photoDrawFailed: false, publishAt: null, scheduledAt: null,
  },
}

function render(items: ReviewItem[]): string {
  return renderToStaticMarkup(createElement(ReviewBoard, { items }))
}

describe('ReviewBoard at phone width', () => {
  it('runs cards edge to edge on a phone and centres them in a column from sm up', () => {
    const html = render([profileItem])
    expect(html).toContain('-mx-4')
    expect(html).toContain('sm:max-w-[440px]')
    expect(html).toContain('max-sm:rounded-none')
  })

  it('keeps "프로필 보기 ›" on its own unbroken line next to 편집 / 맨 앞으로', () => {
    const html = render([profileItem])
    expect(html).toMatch(/<span class="block whitespace-nowrap">프로필 보기 ›<\/span>/)
    expect(html).not.toContain('· 프로필 보기')
    expect(html).toMatch(/class="flex shrink-0 items-center"/)
  })

  it('offers 게시, 삭제, 전체 재제작 and a reorder button on every card', () => {
    const html = render([profileItem, postItem])
    for (const label of ['게시', '삭제', '전체 재제작']) {
      expect(html.split(`>${label}<`).length - 1).toBe(2)
    }
    expect(html).toContain('맨 앞으로')
    expect(html).toContain('고정 해제')
  })

  it('shows when a post will be dated: automatic unless staff set a time', () => {
    expect(render([postItem])).toContain('게시 시각 자동')
    const timed = { ...postItem, post: { ...postItem.post, publishAt: '2026-11-22T06:30:00.000Z' } }
    expect(render([timed])).toContain('게시 시각 11. 22. 오후 03:30')
  })
})
