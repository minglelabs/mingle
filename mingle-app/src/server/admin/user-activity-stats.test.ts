import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { shapeMetrics, USER_ACTIVITY_METRICS } from './user-activity-stats'

describe('shapeMetrics', () => {
  it('lists every metric in order, zero when there is no row, and rounds Hash to 0.1', () => {
    const metrics = shapeMetrics([
      { metric: 'messages_sent', total: 12, last7: 3, last30: 12, first: new Date('2026-11-01T00:00:00Z'), last: new Date('2026-11-20T00:00:00Z') },
      { metric: 'hash_spent', total: 12.345, last7: 0.04, last30: 12.345, first: null, last: null },
    ])
    expect(metrics.map((metric) => metric.key)).toEqual(USER_ACTIVITY_METRICS.map((metric) => metric.key))
    expect(metrics.find((metric) => metric.key === 'messages_sent')).toMatchObject({ total: 12, last7: 3, unit: 'count', first: '2026-11-01T00:00:00.000Z' })
    expect(metrics.find((metric) => metric.key === 'hash_spent')).toMatchObject({ total: 12.3, last7: 0, unit: 'hash' })
    expect(metrics.find((metric) => metric.key === 'posts')).toMatchObject({ total: 0, first: null })
  })
})
