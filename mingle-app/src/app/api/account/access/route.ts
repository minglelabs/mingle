import type { NextRequest } from 'next/server'
import { getAppAccess, postAppAccessCode } from '@/server/api/controllers/shared/app-access-controller'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  return getAppAccess(request)
}

export async function POST(request: NextRequest) {
  return postAppAccessCode(request)
}
