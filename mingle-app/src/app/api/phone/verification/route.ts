import type { NextRequest } from 'next/server'
import { startPhone } from '@/server/api/controllers/shared/phone-contacts-controller'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  return startPhone(request)
}
