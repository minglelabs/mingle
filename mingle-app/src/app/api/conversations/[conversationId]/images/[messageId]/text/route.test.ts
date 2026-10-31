import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const m = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('@/server/api/controllers/shared/conversation-image-text-controller', () => ({ readConversationImageText: m.read }))

import * as unversioned from '@/app/api/conversations/[conversationId]/images/[messageId]/text/route'
import * as iosV220 from '@/app/api/ios/v2.2.0/conversations/[conversationId]/images/[messageId]/text/route'
import * as androidV220 from '@/app/api/android/v2.2.0/conversations/[conversationId]/images/[messageId]/text/route'

describe('conversation image text routes', () => {
  beforeEach(() => {
    m.read.mockReset()
  })

  it.each([
    ['unversioned', unversioned],
    ['ios/v2.2.0', iosV220],
    ['android/v2.2.0', androidV220],
  ])('%s forwards GET to the shared controller on the node runtime', async (_namespace, route) => {
    const response = NextResponse.json({ status: 'pending', blocks: [], translations: [] })
    m.read.mockResolvedValue(response)
    const request = new NextRequest('http://localhost/api/conversations/conv-1/images/msg-1/text?languages=ko')

    await expect(route.GET(request, { params: Promise.resolve({ conversationId: 'conv-1', messageId: 'msg-1' }) })).resolves.toBe(response)
    expect(m.read).toHaveBeenCalledWith(request, 'conv-1', 'msg-1')
    expect(route.runtime).toBe('nodejs')
    expect(Object.keys(route).sort()).toEqual(['GET', 'runtime'])
  })
})
