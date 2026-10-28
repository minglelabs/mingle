import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { feedPostRowSelect } from './feed-post-loader'

describe('feedPostRowSelect', () => {
  it('reads author.isOfficial for every list that shares it (profile grid, search, archive, hidden)', () => {
    expect(feedPostRowSelect.author.select.isOfficial).toBe(true)
  })

  it('reads author.isOperator for the same lists and the single-post read', () => {
    expect(feedPostRowSelect.author.select.isOperator).toBe(true)
  })
})
