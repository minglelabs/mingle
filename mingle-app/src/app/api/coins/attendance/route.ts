import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { claimAttendance } from '@/server/coins/attendance'
import { settleDmOpenCharges } from '@/server/dm-open-charge'

export const runtime = 'nodejs'

/**
 * POST: today's attendance (see @/server/coins/attendance). The app sends it
 * once a day when it opens; a repeat pays nothing. Also gives back the Hash
 * of rooms that went unanswered (see @/server/dm-open-charge).
 */
export async function POST() {
  const session = await getServerSession(getAuthOptions()) as { user?: { id?: unknown } } | null
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const refunded = await settleDmOpenCharges(userId).catch((error) => {
    console.warn('[dm-open-charge] settle_failed', error instanceof Error ? error.name : 'unknown')
    return { refundedCoins: 0, rooms: 0 }
  })
  const attendance = await claimAttendance(userId)
  return NextResponse.json({ attendance, refunded }, { headers: { 'Cache-Control': 'private, no-store' } })
}
