import type { NextRequest } from 'next/server'
import { redeemReferral } from '@/server/api/controllers/shared/referral-controller'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  return redeemReferral(request)
}
