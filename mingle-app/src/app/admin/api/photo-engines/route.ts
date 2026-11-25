import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { seedreamImageIds } from '@/server/seedream/drawn-images'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET: the photos Seedream drew (post photo keys, profile photo URLs); every other drawn photo is the ChatGPT pool's. */
export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  return NextResponse.json({ seedream: [...await seedreamImageIds()] }, { headers: { 'Cache-Control': 'private, no-store' } })
}
