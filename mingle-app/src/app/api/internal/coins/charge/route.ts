import type { NextRequest } from 'next/server'
import { chargeCoinsInternally } from '@/server/api/controllers/shared/coins-controller'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  return chargeCoinsInternally(request)
}
