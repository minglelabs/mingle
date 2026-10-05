import type {
  ConversationHydrationInviteNotice,
  ConversationHydrationLeaveNotice,
  ConversationHydrationUtterance,
} from '@/lib/app-conversations'
import type { Utterance } from '@/components/LivePhoneDemo/ChatBubble'
import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'
import { inboxPersonLabel } from './inbox-format'

/** The admin-only reading language. */
export const STAFF_KOREAN = 'ko'

/** A room message as the admin room keeps it (hydration shape, plus the optional live badge). */
export type RoomUtterance = ConversationHydrationUtterance & { speakerBadge?: 'official' | 'operator' }

function sortKey(utterance: RoomUtterance): number {
  return utterance.serverCreatedAtMs ?? utterance.createdAtMs
}

function byTime(left: RoomUtterance, right: RoomUtterance): number {
  return sortKey(left) - sortKey(right) || left.createdAtMs - right.createdAtMs
}

/** Older pages + the latest page, deduplicated by id (latest copy wins), oldest first. */
export function mergeUtterancePages(older: RoomUtterance[], latest: RoomUtterance[]): RoomUtterance[] {
  const byId = new Map<string, RoomUtterance>()
  for (const utterance of older) byId.set(utterance.id, utterance)
  for (const utterance of latest) byId.set(utterance.id, utterance)
  return [...byId.values()].sort(byTime)
}

/** Inserts or replaces one utterance, keeping time order. */
export function upsertUtterance(list: RoomUtterance[], utterance: RoomUtterance): RoomUtterance[] {
  return mergeUtterancePages(list.filter((item) => item.id !== utterance.id), [utterance])
}

/** ChatBubble's optional-field shape (it uses undefined where hydration uses null). */
export function toBubbleUtterance(utterance: RoomUtterance): Utterance {
  return {
    ...(utterance.image ? { image: utterance.image } : {}),
    id: utterance.id,
    speaker: utterance.speaker ?? undefined,
    speakerAvatarSeed: utterance.speakerAvatarSeed ?? undefined,
    speakerAvatarIndex: utterance.speakerAvatarIndex ?? undefined,
    speakerName: utterance.speakerName,
    speakerUserId: utterance.speakerUserId,
    speakerImage: utterance.speakerImage,
    originalText: utterance.originalText,
    ...(utterance.originalDisplayText ? { originalDisplayText: utterance.originalDisplayText } : {}),
    originalLang: utterance.originalLang,
    targetLanguages: [...utterance.targetLanguages],
    translations: { ...utterance.translations },
    translationFinalized: { ...utterance.translationFinalized },
    createdAtMs: utterance.createdAtMs,
    ...(typeof utterance.serverCreatedAtMs === 'number' ? { serverCreatedAtMs: utterance.serverCreatedAtMs } : {}),
    ...(utterance.serverMessageId ? { serverMessageId: utterance.serverMessageId } : {}),
  }
}

function isKorean(language: string | null | undefined): boolean {
  return canonicalizeTranslationLanguageCode(language || '') === STAFF_KOREAN
}

/**
 * The server message id to translate into Korean for staff, or null when the
 * bubble already has Korean (original or translation), is a photo, or has
 * no server id.
 */
export function staffKoreanCandidateId(utterance: RoomUtterance): string | null {
  if (utterance.image || !utterance.serverMessageId) return null
  if (isKorean(utterance.originalLang)) return null
  if (Object.keys(utterance.translations).some(isKorean)) return null
  return utterance.serverMessageId
}

/**
 * Adds the staff-only Korean to one bubble, client-side only: with text it
 * becomes a finalized `ko` translation; while it is loading, `ko` is only a
 * target (the bubble shows its pending dots); without either, unchanged.
 */
export function withStaffKorean(bubble: Utterance, koText: string | null | undefined, pending: boolean): Utterance {
  if (!koText && !pending) return bubble
  const targetLanguages = [...(bubble.targetLanguages ?? [])]
  if (!targetLanguages.some(isKorean)) targetLanguages.push(STAFF_KOREAN)
  if (!koText) return { ...bubble, targetLanguages }
  return {
    ...bubble,
    targetLanguages,
    translations: { ...bubble.translations, [STAFF_KOREAN]: koText },
    translationFinalized: { ...(bubble.translationFinalized ?? {}), [STAFF_KOREAN]: true },
  }
}

export type RoomTimelineItem =
  | { kind: 'message'; key: string; utterance: RoomUtterance }
  | { kind: 'notice'; key: string; atMs: number; text: string }

/**
 * Messages and the room's leave / invite notices in one time line. Notices
 * older than the oldest loaded message wait until that history is loaded
 * (unless there is no more history).
 */
export function buildRoomTimeline(args: {
  utterances: RoomUtterance[]
  leaveNotices: ConversationHydrationLeaveNotice[]
  inviteNotices: ConversationHydrationInviteNotice[]
  hasMoreHistory: boolean
}): RoomTimelineItem[] {
  const oldestMs = args.utterances[0] ? sortKey(args.utterances[0]) : Number.POSITIVE_INFINITY
  const notices: Array<Extract<RoomTimelineItem, { kind: 'notice' }>> = [
    ...args.leaveNotices.map((notice) => ({
      kind: 'notice' as const,
      key: `leave:${notice.userId}:${notice.leftAtMs}`,
      atMs: notice.leftAtMs,
      text: `${inboxPersonLabel(notice)}님이 나갔습니다`,
    })),
    ...args.inviteNotices.map((notice) => ({
      kind: 'notice' as const,
      key: `invite:${notice.inviteeUserId}:${notice.invitedAtMs}`,
      atMs: notice.invitedAtMs,
      text: `${inboxPersonLabel({ name: notice.invitedByName, handle: notice.invitedByHandle })}님이 ${
        inboxPersonLabel({ name: notice.inviteeName, handle: notice.inviteeHandle })}님을 초대했습니다`,
    })),
  ].filter((notice) => !args.hasMoreHistory || notice.atMs >= oldestMs)

  const items: RoomTimelineItem[] = args.utterances.map((utterance) => ({
    kind: 'message' as const,
    key: `message:${utterance.id}`,
    utterance,
  }))
  for (const notice of notices.sort((left, right) => left.atMs - right.atMs)) {
    const index = items.findIndex((item) => item.kind === 'message' && sortKey(item.utterance) > notice.atMs)
    if (index < 0) items.push(notice)
    else items.splice(index, 0, notice)
  }
  return items
}
