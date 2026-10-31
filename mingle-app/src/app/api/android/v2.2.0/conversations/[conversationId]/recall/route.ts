import { NextRequest } from 'next/server'
import { recallConversationMessage } from '@/server/api/controllers/shared/message-recall-controller'
export const runtime = 'nodejs'
type Context = { params: Promise<{ conversationId: string }> }
export async function POST(request: NextRequest, { params }: Context) {
  return recallConversationMessage(request, (await params).conversationId)
}
