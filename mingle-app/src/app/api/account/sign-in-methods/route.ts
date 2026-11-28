import type { NextRequest } from 'next/server'
import { deleteSignInMethod, getSignInMethods } from '@/server/api/controllers/shared/sign-in-methods-controller'

export const runtime = 'nodejs'

export async function GET() {
  return getSignInMethods()
}

export async function DELETE(request: NextRequest) {
  return deleteSignInMethod(request)
}
