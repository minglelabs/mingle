import type { NextRequest } from 'next/server'
import { patchReferral, readReferral } from '@/server/api/controllers/shared/referral-controller'

export const runtime = 'nodejs'

export async function GET() {
  return readReferral()
}

export async function PATCH(request: NextRequest) {
  return patchReferral(request)
}
