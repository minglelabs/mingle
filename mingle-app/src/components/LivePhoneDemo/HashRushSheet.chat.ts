// The room's messages as the Hash Rush game hears them: one `chat` entry per
// message (HashRushSheet.logic.ts has the contract and when each one goes).
// Kept apart from HashRushSheet.logic.ts because it reads messages with the
// bubbles' own language rules (ChatBubble), which that file does not load.

import { resolveOriginalDisplayText, type Utterance } from './ChatBubble'
import {
  resolveEarphoneModeDefaultReadLanguage,
  resolveEarphoneModeReadTarget,
  type EarphoneModeDisplayContext,
} from './live-phone-demo.earphone-mode.logic'
import { utteranceOrderTime } from './utterance-order'
import type { HashRushChatEntry } from './HashRushSheet.logic'
import { normalizeConversationMessageImage } from '@/lib/conversation-image'

// Only the room's latest messages can be new to the game; older ones are
// history it never hears.
export const HASH_RUSH_CHAT_SOURCE_WINDOW = 40

/**
 * The sender's user id, the one their Hash Rush ticket carries (the server
 * signs the ticket with the member's user id). A row without an account id is
 * the viewer's in a room of one; in a shared room only the server's
 * `sentByViewer` says whose it is.
 */
export function resolveHashRushChatSenderId(
  utterance: Pick<Utterance, 'speakerUserId' | 'sentByViewer'>,
  viewerUserId: string | null | undefined,
  isSharedRoom: boolean,
): string | null {
  const speaker = utterance.speakerUserId?.trim()
  if (speaker) return speaker
  const viewer = viewerUserId?.trim()
  if (!viewer) return null
  if (utterance.sentByViewer === true) return viewer
  if (utterance.sentByViewer === false || isSharedRoom) return null
  return viewer
}

/**
 * What this viewer reads: the final translation into their language (the one
 * the room's one-bubble view shows them), else the original.
 */
export function resolveHashRushChatText(
  utterance: Utterance,
  languageOrder: readonly string[],
  readLanguage: string | null,
): string {
  const original = resolveOriginalDisplayText(utterance).trim()
  if (!readLanguage) return original
  const target = resolveEarphoneModeReadTarget(utterance, { readLanguage, languageOrder })
  return target?.text.trim() || original
}

export function buildHashRushChatEntries(input: {
  /** The room's messages in order, as the room draws them. */
  utterances: readonly Utterance[]
  /** Messages still being spoken. */
  draftIds: ReadonlySet<string>
  /** The display-language inputs each bubble row gets. */
  display: EarphoneModeDisplayContext
  viewerUserId: string | null | undefined
  isSharedRoom: boolean
}): HashRushChatEntry[] {
  const readLanguage = resolveEarphoneModeDefaultReadLanguage(input.display)
  const entries: HashRushChatEntry[] = []
  for (const utterance of input.utterances.slice(-HASH_RUSH_CHAT_SOURCE_WINDOW)) {
    // A deleted message or a photo has nothing to say over a hamster.
    if (utterance.recalled === true || normalizeConversationMessageImage(utterance.image)) continue
    const userId = resolveHashRushChatSenderId(utterance, input.viewerUserId, input.isSharedRoom)
    if (!userId) continue
    const pending = input.draftIds.has(utterance.id)
    const text = pending ? '' : resolveHashRushChatText(utterance, input.display.languageOrder, readLanguage)
    if (!pending && !text) continue
    entries.push({ id: utterance.id, userId, text, orderTimeMs: utteranceOrderTime(utterance), pending })
  }
  return entries
}
