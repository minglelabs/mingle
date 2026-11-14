import type { NextRequest } from 'next/server'
import { readPhoneSignInAvailability, startPhoneSignInRequest } from '@/server/api/controllers/shared/phone-contacts-controller'

export const runtime = 'nodejs'

export async function GET() {
  return readPhoneSignInAvailability()
}

export async function POST(request: NextRequest) {
  return startPhoneSignInRequest(request)
}
