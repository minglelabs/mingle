import { postWaitlist } from '@/server/api/controllers/shared/app-access-controller'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  return postWaitlist(request)
}
