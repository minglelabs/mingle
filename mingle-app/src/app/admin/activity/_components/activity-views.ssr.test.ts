import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import type { ActivityListData } from '@/server/operator-activity/activity'
import type { OperatorPostThread } from '@/server/operator-activity/thread'
import { ActivityListView, activityItemHref } from './activity-list-view'
import { PostThreadView } from './post-thread-view'

// Server render of both screens with fixture data: catches render-time
// errors and pins the copy staff rely on (no browser or server needed).

const person = (userId: string, name: string) => ({
  userId, handle: userId, name, image: null, imageCropScale: null, imageCropX: null, imageCropY: null,
})
const operator = person('op_1', 'Mina')
const actor = person('user_1', 'João')

const listData: ActivityListData = {
  items: [
    {
      id: 'n1', type: 'comment', isRead: false, createdAt: '2026-10-02T09:58:00.000Z', operator, actor,
      postId: 'p1', postExcerpt: 'Bom dia', postUnavailable: false,
      commentId: 'c1', commentText: 'Que legal!', commentKoText: '멋져요!', commentHasImage: false, commentUnavailable: false,
    },
    {
      id: 'n2', type: 'follow', isRead: true, createdAt: '2026-10-02T09:00:00.000Z', operator, actor,
      postId: null, postExcerpt: null, postUnavailable: false,
      commentId: null, commentText: null, commentKoText: null, commentHasImage: false, commentUnavailable: false,
    },
  ],
  nextCursor: 'n2',
  unreadTotal: 1,
  operators: [{ ...operator, isActive: true, itemCount: 2, unreadCount: 1 }],
  readBefore: '2026-10-02T10:00:00.000Z',
  serverNowMs: Date.parse('2026-10-02T10:00:00.000Z'),
}

const thread: OperatorPostThread = {
  post: {
    id: 'p1', author: operator, text: 'Bom dia', koText: '좋은 아침', hasImage: false,
    likeCount: 3, commentCount: 2, publishedAt: '2026-10-02T08:00:00.000Z',
  },
  operator: { ...operator, personaLanguage: 'pt', isActive: true },
  operators: [{ ...operator, personaLanguage: 'pt', isActive: true }],
  replyUnavailableReason: null,
  comments: [{
    id: 'c1', parentId: null, author: actor, replyTo: null, text: 'Que legal!', koText: '멋져요!', hasImage: false,
    isDeleted: false, likeCount: 1, createdAt: '2026-10-02T09:58:00.000Z',
    replies: [{
      id: 'c2', parentId: 'c1', author: operator, replyTo: { userId: 'user_1', label: 'João' }, text: 'Obrigada!', koText: null,
      hasImage: false, isDeleted: false, likeCount: 0, createdAt: '2026-10-02T09:59:00.000Z', replies: [],
    }],
  }],
}

describe('admin activity screens', () => {
  it('links an item to its thread as the operator that received it', () => {
    expect(activityItemHref(listData.items[0])).toBe('/admin/activity/posts/p1?as=op_1&comment=c1')
    expect(activityItemHref(listData.items[1])).toBeNull()
    expect(activityItemHref({ ...listData.items[0], postUnavailable: true })).toBeNull()
  })

  it('renders the unified list with operator filters and unread state', () => {
    const html = renderToString(createElement(ActivityListView, { initialData: listData }))
    expect(html).toContain('알림')
    expect(html).toContain('님이 댓글을 남겼습니다')
    expect(html).toContain('님이 팔로우했습니다')
    expect(html).toContain('Que legal!')
    expect(html).toContain('받은 계정')
    expect(html).toContain('모두 읽음')
    expect(html).toContain('href="/admin/activity/posts/p1?as=op_1&amp;comment=c1"')
    expect(html).toContain('더 보기')
  })

  it('renders the thread with a composer for the operator', () => {
    const html = renderToString(createElement(PostThreadView, { initialThread: thread, focusCommentId: 'c1' }))
    expect(html).toContain('Bom dia')
    expect(html).toContain('Que legal!')
    expect(html).toContain('Obrigada!')
    expect(html).toContain('답글 달기')
    expect(html).toContain('계정으로 게시됩니다')
    expect(html).toContain('id="comment-c1"')
  })

  it('shows no composer for a retired operator', () => {
    const html = renderToString(createElement(PostThreadView, {
      initialThread: { ...thread, operator: { ...thread.operator, isActive: false }, replyUnavailableReason: 'operator_inactive' },
      focusCommentId: null,
    }))
    expect(html).toContain('비활성화된 운영 계정이라 댓글을 달 수 없습니다')
    expect(html).not.toContain('답글 달기')
  })
})
