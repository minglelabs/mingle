import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))

import type {
  OperatorPostBatchDetail,
  OperatorPostBatchSummary,
  OperatorPostPickerEntry,
} from '@/server/operator-posts/types'
import { newComposerItem, type ComposerItem } from '../_lib/composer'
import AdminPostsScreen from './admin-posts-screen'
import BatchStatusView from './batch-status-view'
import ComposerItemCard, { type ComposerItemHandlers } from './composer-item-card'

const OPERATOR: OperatorPostPickerEntry = {
  id: 'op_1',
  handle: 'lucas.silva',
  name: 'Lucas Silva',
  image: null,
  language: 'pt',
  isActive: true,
  restricted: false,
}

const BATCH: OperatorPostBatchSummary = {
  batchId: 'b1',
  createdAt: '2026-10-01T05:05:00.000Z',
  total: 3,
  counts: { queued: 1, published: 1, duplicate: 1 },
  firstPublishAt: '2026-10-01T05:07:00.000Z',
  lastPublishAt: '2026-10-01T10:52:00.000Z',
  operators: [OPERATOR],
  operatorCount: 1,
}

const noop = () => {}
const handlers: ComposerItemHandlers = {
  onPickOperator: noop,
  onTextChange: noop,
  onTextBlur: noop,
  onToggleConvert: noop,
  onConvert: noop,
  onPickPhoto: noop,
  onRemovePhoto: noop,
  onRetryPhoto: noop,
  onBackground: noop,
  onPublishAt: noop,
  onRemove: noop,
}

describe('admin posts screens (server render)', () => {
  it('renders the composer with one empty post, the schedule modes and the recent batches, deterministically', () => {
    const element = createElement(AdminPostsScreen, { operators: [OPERATOR], batches: [BATCH], textMax: 1000 })
    const html = renderToStaticMarkup(element)
    expect(html).toContain('새 게시물')
    expect(html).toContain('최근 배치 · 대기 1')
    expect(html).toContain('게시물 1')
    expect(html).toContain('운영 계정 고르기')
    expect(html).toContain('나눠서 게시')
    expect(html).toContain('바로 게시')
    expect(html).toContain('시간 지정')
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"')
    // Recent batch card, in KST, duplicates counted as published.
    expect(html).toContain('10월 1일 (목) 14:05 만듦 · 3개')
    expect(html).toContain('게시 10월 1일 (목) 14:07 ~ 19:52')
    expect(html).toContain('게시됨 2')
    expect(html).toContain('href="/admin/posts/batches/b1"')
    // Same markup on every render: nothing time- or random-dependent in the first paint.
    expect(renderToStaticMarkup(element)).toBe(html)
  })

  it('shows the converted text staff will post, with its length', () => {
    const item: ComposerItem = {
      ...newComposerItem('item-1', 'op_1'),
      text: '오늘 카페 최고!',
      conversion: {
        status: 'ready',
        forText: '오늘 카페 최고!',
        forOperatorId: 'op_1',
        text: 'O café hoje estava incrível!',
        language: 'pt',
        converted: true,
        error: null,
      },
    }
    const html = renderToStaticMarkup(
      createElement(ComposerItemCard, { item, number: 1, operator: OPERATOR, mode: 'spread', textMax: 1000, issue: null, handlers }),
    )
    expect(html).toContain('Lucas Silva')
    expect(html).toContain('@lucas.silva · 포르투갈어')
    expect(html).toContain('페르소나 언어(포르투갈어)로 변환')
    expect(html).toContain('O café hoje estava incrível!')
    expect(html).toContain('포르투갈어로 바꿨어요')
    expect(html).toContain('게시될 내용 28/1000자')
  })

  it('asks for a fresh conversion once the text changed after converting', () => {
    const item: ComposerItem = {
      ...newComposerItem('item-1', 'op_1'),
      text: '오늘 카페 최고였어!',
      conversion: {
        status: 'ready',
        forText: '오늘 카페 최고!',
        forOperatorId: 'op_1',
        text: 'O café hoje estava incrível!',
        language: 'pt',
        converted: true,
        error: null,
      },
    }
    const html = renderToStaticMarkup(
      createElement(ComposerItemCard, { item, number: 1, operator: OPERATOR, mode: 'at', textMax: 1000, issue: 'needs_conversion', handlers }),
    )
    expect(html).toContain('내용이 바뀌었어요. 다시 변환해 주세요.')
    expect(html).toContain('다시 변환')
    expect(html).not.toContain('O café hoje estava incrível!')
    expect(html).toContain('type="datetime-local"')
    expect(html).toContain('변환 미리보기를 먼저 만들어 주세요.')
  })

  it('renders each job with its state, cancel for queued, a post link for published and the failure reason', () => {
    const base = {
      operator: { id: 'op_1', handle: 'lucas.silva', name: 'Lucas Silva', image: null, language: 'pt' },
      imageObjectKey: null,
      backgroundKey: null,
      postId: null,
      error: null,
      attempts: 0,
      updatedAt: '2026-10-01T05:05:00.000Z',
    }
    const batch: OperatorPostBatchDetail = {
      batchId: 'b1',
      createdAt: '2026-10-01T05:05:00.000Z',
      items: [
        {
          ...base,
          id: 'job_1',
          index: 1,
          clientPostId: 'op-b1-1',
          text: 'Olá!',
          publishAt: '2026-10-01T05:07:00.000Z',
          state: 'published',
          postId: 'op-b1-1',
          attempts: 1,
          updatedAt: '2026-10-01T05:07:20.000Z',
        },
        {
          ...base,
          id: 'job_2',
          index: 2,
          clientPostId: 'op-b1-2',
          text: null,
          imageObjectKey: 'post-images/op_1/123e4567-e89b-42d3-a456-426614174000.jpg',
          publishAt: '2026-10-01T08:07:00.000Z',
          state: 'queued',
        },
        {
          ...base,
          id: 'job_3',
          index: 3,
          clientPostId: 'op-b1-3',
          text: 'Tchau',
          publishAt: '2026-10-01T09:07:00.000Z',
          state: 'failed',
          attempts: 5,
          error: 'Error: provider down',
        },
      ],
    }
    const html = renderToStaticMarkup(createElement(BatchStatusView, { initial: batch }))
    expect(html).toContain('배치 상태')
    expect(html).toContain('게시됨 10월 1일 (목) 14:07')
    expect(html).toContain('href="/ko/posts/viewer?kind=author&amp;authorId=op_1&amp;postId=op-b1-1"')
    expect(html).toContain('예정 10월 1일 (목) 17:07')
    expect(html).toContain('예약 취소')
    expect(html).toContain('대기 중인 1개 모두 취소')
    expect(html).toContain(
      'src="/admin/posts/api/images?key=post-images%2Fop_1%2F123e4567-e89b-42d3-a456-426614174000.jpg"',
    )
    expect(html).toContain('게시 중 오류가 났어요.')
    expect(html).toContain('Error: provider down')
    expect(html).toContain('실패 · 5회 시도함')
  })
})
