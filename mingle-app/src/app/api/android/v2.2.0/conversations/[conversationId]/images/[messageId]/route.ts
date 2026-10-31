import { NextRequest } from 'next/server'
import { readConversationImage } from '@/server/api/controllers/shared/conversation-image-controller'
export const runtime = 'nodejs'
export async function GET(request: NextRequest, { params }: { params: Promise<{ conversationId: string; messageId: string }> }) {
  const { conversationId, messageId } = await params
  return readConversationImage(request, conversationId, messageId)
}
