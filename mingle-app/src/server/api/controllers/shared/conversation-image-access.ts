import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { getConversationSessionKeyForMember } from '@/lib/app-conversations'
import { matchesExpectedAccount } from '@/lib/request-account-guard'

export type ConversationImageScope = { userId: string; sessionKey: string }
export type StoredConversationImage = { objectKey: string; sha256: string; width: number; height: number }

/**
 * Signed-in, still-active member of the conversation, or the error response
 * (401 anonymous, 404 non-member). With `request`, a stale-account
 * precondition header (EXPECTED_ACCOUNT_HEADER) also answers 401.
 */
export async function authorizeConversationImageScope(conversationId: string, request?: Request): Promise<ConversationImageScope | NextResponse> {
  const session = await getServerSession(getAuthOptions())
  if (!session?.user?.id || (request && !matchesExpectedAccount(request, session))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const userId = session.user.id
  const sessionKey = await getConversationSessionKeyForMember({ conversationId, userId })
  return sessionKey ? { userId, sessionKey } : NextResponse.json({ error: 'not_found' }, { status: 404 })
}

/** metadata.image of a photo message, or null when the message is not a stored photo. */
export function readStoredConversationImage(metadata: unknown): StoredConversationImage | null {
  const image = (metadata as { image?: { objectKey?: unknown; sha256?: unknown; width?: unknown; height?: unknown } } | null)?.image
  return image && typeof image.objectKey === 'string' && /^conversation-images\/[\w-]+\.jpg$/.test(image.objectKey)
    && typeof image.sha256 === 'string' && typeof image.width === 'number' && typeof image.height === 'number'
    ? image as StoredConversationImage : null
}
