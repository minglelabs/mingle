import { NextRequest } from 'next/server'
import { postConversationImage } from '@/server/api/controllers/shared/conversation-image-controller'
export const runtime = 'nodejs'
export async function POST(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  return postConversationImage(request, (await params).conversationId)
}
