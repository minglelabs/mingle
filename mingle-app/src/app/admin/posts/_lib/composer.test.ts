import { describe, expect, it } from 'vitest'
import {
  batchOutcome,
  buildBatchItems,
  fillPublishTimes,
  finalText,
  itemIssue,
  mergeBatchOutcome,
  needsConversion,
  newComposerItem,
  type ComposerItem,
} from './composer'

const TEXT_MAX = 1000
const KEY = 'post-images/op_1/123e4567-e89b-42d3-a456-426614174000.jpg'

function item(overrides: Partial<ComposerItem> = {}): ComposerItem {
  return { ...newComposerItem('item-1', 'op_1'), ...overrides }
}

function converted(text: string, into: string, forOperatorId = 'op_1'): ComposerItem['conversion'] {
  return { status: 'ready', forText: text, forOperatorId, text: into, language: 'pt', converted: true, error: null }
}

function photo(overrides: Partial<NonNullable<ComposerItem['photo']>> = {}): NonNullable<ComposerItem['photo']> {
  return {
    file: new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }),
    previewUrl: 'blob:1',
    status: 'ready',
    forOperatorId: 'op_1',
    imageObjectKey: KEY,
    width: 1200,
    height: 900,
    error: null,
    ...overrides,
  }
}

describe('composer conversion gate', () => {
  it('posts the conversion only while it matches the current text and operator', () => {
    const ready = item({ text: '안녕', conversion: converted('안녕', 'Olá') })
    expect(finalText(ready)).toBe('Olá')
    expect(needsConversion(ready)).toBe(false)
    expect(itemIssue(ready, { textMax: TEXT_MAX, mode: 'spread' })).toBeNull()

    const edited = { ...ready, text: '안녕하세요' }
    expect(finalText(edited)).toBeNull()
    expect(needsConversion(edited)).toBe(true)
    expect(itemIssue(edited, { textMax: TEXT_MAX, mode: 'spread' })).toBe('needs_conversion')

    const otherOperator = { ...ready, operatorId: 'op_2' }
    expect(finalText(otherOperator)).toBeNull()
    expect(needsConversion(otherOperator)).toBe(true)
  })

  it('posts the original as written when conversion is off', () => {
    const plain = item({ text: 'Olá, gente', convert: false })
    expect(finalText(plain)).toBe('Olá, gente')
    expect(needsConversion(plain)).toBe(false)
    expect(itemIssue(plain, { textMax: TEXT_MAX, mode: 'spread' })).toBeNull()
  })

  it('does not ask for a conversion while one for the same text is in flight', () => {
    const inFlight = item({
      text: '안녕',
      conversion: { status: 'converting', forText: '안녕', forOperatorId: 'op_1', text: null, language: null, converted: false, error: null },
    })
    expect(needsConversion(inFlight)).toBe(false)
    expect(itemIssue(inFlight, { textMax: TEXT_MAX, mode: 'spread' })).toBe('converting')
  })

  it('reports a failed conversion for the current text', () => {
    const failed = item({
      text: '안녕',
      conversion: { status: 'error', forText: '안녕', forOperatorId: 'op_1', text: null, language: null, converted: false, error: 'conversion_failed' },
    })
    expect(itemIssue(failed, { textMax: TEXT_MAX, mode: 'spread' })).toBe('conversion_error')
  })
})

describe('composer item issues', () => {
  const options = { textMax: TEXT_MAX, mode: 'spread' as const }

  it('needs an operator and some content', () => {
    expect(itemIssue(item({ operatorId: null, text: 'hi', convert: false }), options)).toBe('operator')
    expect(itemIssue(item(), options)).toBe('content')
  })

  it('waits for the photo upload of the current operator', () => {
    expect(itemIssue(item({ photo: photo({ status: 'uploading', imageObjectKey: null }) }), options)).toBe('photo_pending')
    expect(itemIssue(item({ photo: photo({ forOperatorId: 'op_2' }) }), options)).toBe('photo_pending')
    expect(itemIssue(item({ photo: photo({ status: 'error' }) }), options)).toBe('photo_error')
    expect(itemIssue(item({ photo: photo() }), options)).toBeNull()
  })

  it('checks the length of what will be posted, not of the original', () => {
    const long = 'a'.repeat(1500)
    expect(itemIssue(item({ text: long, conversion: converted(long, 'b'.repeat(900)) }), options)).toBeNull()
    expect(itemIssue(item({ text: '짧음', conversion: converted('짧음', 'c'.repeat(1001)) }), options)).toBe('too_long')
    expect(itemIssue(item({ text: 'd'.repeat(1001), convert: false }), options)).toBe('too_long')
  })

  it('needs a valid time in "시간 지정"', () => {
    const ready = item({ text: 'hi', convert: false })
    expect(itemIssue(ready, { ...options, mode: 'at' })).toBe('publish_at')
    expect(itemIssue({ ...ready, publishAt: '2026-10-01T21:30' }, { ...options, mode: 'at' })).toBeNull()
  })
})

describe('buildBatchItems', () => {
  const items = [
    item({ key: 'a', text: '안녕', conversion: converted('안녕', 'Olá'), backgroundKey: 'ocean-blue', publishAt: '2026-10-01T21:30' }),
    item({ key: 'b', photo: photo() }),
  ]

  it('sends the converted text, the operator-owned photo and the schedule of each mode', () => {
    expect(buildBatchItems(items, 'spread')).toEqual([
      {
        operatorUserId: 'op_1',
        text: 'Olá',
        imageObjectKey: null,
        imageWidth: null,
        imageHeight: null,
        backgroundKey: 'ocean-blue',
        publishAt: null,
      },
      {
        operatorUserId: 'op_1',
        text: null,
        imageObjectKey: KEY,
        imageWidth: 1200,
        imageHeight: 900,
        backgroundKey: null,
        publishAt: null,
      },
    ])
    expect(buildBatchItems(items, 'now').map((entry) => entry.publishAt)).toEqual(['now', 'now'])
    expect(buildBatchItems(items, 'at')[0].publishAt).toBe('2026-10-01T12:30:00.000Z')
  })
})

describe('batch outcome', () => {
  it('drops queued items and keeps refused ones with their reason, applied to the current items', () => {
    const submitted = [item({ key: 'a' }), item({ key: 'b' }), item({ key: 'c' })]
    const outcome = batchOutcome(submitted, {
      batchId: 'b1',
      queued: 2,
      invalid: 1,
      items: [
        { index: 0, state: 'queued', jobId: 'j1', clientPostId: 'op-b1-1', publishAt: '2026-10-01T03:02:00Z' },
        { index: 1, state: 'invalid', reason: 'account_restricted' },
        { index: 2, state: 'queued', jobId: 'j3', clientPostId: 'op-b1-3', publishAt: '2026-10-01T06:02:00Z' },
      ],
    })
    // An item added while the request was in flight survives.
    const current = [...submitted, item({ key: 'd' })]
    const remaining = mergeBatchOutcome(current, outcome)
    expect(remaining.map((entry) => [entry.key, entry.rejection])).toEqual([
      ['b', 'account_restricted'],
      ['d', null],
    ])
  })
})

describe('fillPublishTimes', () => {
  it('fills empty times 30 minutes apart from an hour ahead, keeping ones already set', () => {
    const now = Date.parse('2026-10-01T12:31:00Z') // 21:31 KST
    const filled = fillPublishTimes(
      [item({ key: 'a' }), item({ key: 'b', publishAt: '2026-10-02T09:00' }), item({ key: 'c' })],
      now,
    )
    expect(filled.map((entry) => entry.publishAt)).toEqual(['2026-10-01T22:40', '2026-10-02T09:00', '2026-10-02T09:30'])
  })
})
