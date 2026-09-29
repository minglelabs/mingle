import { NextRequest } from 'next/server'
import { getMessageReactions, putMessageReaction } from '@/server/api/controllers/shared/message-reaction-controller'
export const runtime = 'nodejs'
type Context = { params: Promise<{ conversationId: string }> }
export async function GET(request: NextRequest, { params }: Context) {
  return getMessageReactions(request, (await params).conversationId)
}
export async function PUT(request: NextRequest, { params }: Context) {
  return putMessageReaction(request, (await params).conversationId)
}
