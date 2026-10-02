import { NextResponse, type NextRequest } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import {
  buildAdminInboxEventKey,
  mintAdminInboxRealtimeToken,
  resolveConversationEventsWsUrl,
} from '@/server/conversation-realtime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Subscription for the admin inbox's live updates: open
 * `${wsUrl}?token=${token}`; every event on `key` means "a room with an
 * operator account changed", so refetch (and keep the polling fallback).
 * `{ token: null, wsUrl: null, key: null }` when realtime is unconfigured.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const token = mintAdminInboxRealtimeToken()
  const key = token ? buildAdminInboxEventKey() : null
  const wsUrl = token ? resolveConversationEventsWsUrl(request) : null
  return NextResponse.json(
    token && key && wsUrl ? { token, wsUrl, key } : { token: null, wsUrl: null, key: null },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
