import type { NextRequest } from 'next/server'
import { matchContacts } from '@/server/api/controllers/shared/phone-contacts-controller'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  return matchContacts(request)
}
