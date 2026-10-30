import { NextRequest } from 'next/server'
import { readConversationImageText } from '@/server/api/controllers/shared/conversation-image-text-controller'
export const runtime = 'nodejs'
export async function GET(request: NextRequest, { params }: { params: Promise<{ conversationId: string; messageId: string }> }) {
  const { conversationId, messageId } = await params
  return readConversationImageText(request, conversationId, messageId)
}
