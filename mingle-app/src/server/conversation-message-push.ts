import { prisma } from '@/lib/prisma'

/** How long a message logged ahead of its translation waits for that translation before its push goes out untranslated. */
export const MESSAGE_PUSH_TRANSLATION_WAIT_MS = 5_000
const CLAIM_TTL_MS = 10 * 60 * 1000

type ClaimState = Map<string, number>
const STATE_KEY = Symbol.for('mingle.conversationMessagePushClaims.v1')

function claims(): ClaimState {
  const holder = globalThis as typeof globalThis & { [STATE_KEY]?: ClaimState }
  holder[STATE_KEY] ??= new Map()
  return holder[STATE_KEY]
}

/**
 * True for the first caller per message: the original and its translation update
 * both try to send the push, and only one may. In memory, because the server runs
 * as a single instance (Railway `numReplicas: 1`).
 */
export function claimConversationMessagePush(messageId: string, nowMs = Date.now()): boolean {
  const state = claims()
  for (const [id, claimedAt] of state) {
    if (nowMs - claimedAt > CLAIM_TTL_MS) state.delete(id)
  }
  if (state.has(messageId)) return false
  state.set(messageId, nowMs)
  return true
}

/** The message's finished translations by language, as stored so far. */
export async function readMessageFinalTranslations(messageId: string): Promise<Record<string, string>> {
  const rows = await prisma.appMessageContent.findMany({
    where: { messageId, contentType: 'TRANSLATION_FINAL', OR: [{ isDeleted: false }, { isDeleted: null }] },
    select: { language: true, text: true },
  }).catch(() => [])
  return Object.fromEntries(rows.flatMap((row) => (row.text.trim() ? [[row.language, row.text]] : [])))
}

/** Tests only: forget every claim. */
export function __resetConversationMessagePushClaimsForTests(): void {
  claims().clear()
}
