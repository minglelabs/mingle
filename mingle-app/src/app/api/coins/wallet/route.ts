import type { NextRequest } from 'next/server'
import { readCoinWallet } from '@/server/api/controllers/shared/coins-controller'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  return readCoinWallet(request)
}
