import { NextRequest } from 'next/server'
import { retranslateConversationMessage } from '@/server/api/controllers/shared/message-retranslate-controller'
export const runtime = 'nodejs'
type Context = { params: Promise<{ conversationId: string }> }
export async function POST(request: NextRequest, { params }: Context) {
  return retranslateConversationMessage(request, (await params).conversationId)
}
