import type { NextRequest } from 'next/server'
import { handlePolarWebhook } from '@/server/api/controllers/shared/coins-controller'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  return handlePolarWebhook(request)
}
