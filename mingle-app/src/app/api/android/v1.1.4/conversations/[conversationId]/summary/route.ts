import { type NextRequest } from 'next/server'
import { postConversationSummaryResponse } from '@/server/api/controllers/shared/conversation-summary-controller'

type AndroidConversationSummaryRouteProps = {
  params: Promise<{ conversationId: string }>
}

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: AndroidConversationSummaryRouteProps,
) {
  const { conversationId } = await params
  return postConversationSummaryResponse(request, conversationId)
}
