import { NextRequest } from 'next/server'
import { profileBioResponse } from '@/server/api/controllers/shared/profile-bio-controller'
export const runtime = 'nodejs'
export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  return profileBioResponse(request, (await params).userId)
}
export const POST = GET
