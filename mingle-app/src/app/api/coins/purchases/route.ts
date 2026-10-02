import type { NextRequest } from 'next/server'
import { createCoinPurchase } from '@/server/api/controllers/shared/coins-controller'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  return createCoinPurchase(request)
}
