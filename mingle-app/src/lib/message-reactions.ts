export const MESSAGE_REACTIONS = [
  { kind: 'like', emoji: '👍' },
  { kind: 'heart', emoji: '❤️' },
  { kind: 'check', emoji: '✅' },
  { kind: 'sad', emoji: '😢' },
  { kind: 'laugh', emoji: '😂' },
] as const
export type MessageReactionKind = typeof MESSAGE_REACTIONS[number]['kind']
export type MessageReactionSummary = { kind: MessageReactionKind; count: number; mine: boolean }
export const MESSAGE_REACTIONS_REFRESH_EVENT = 'mingle:message-reactions-refresh'
export function isMessageReactionKind(value: unknown): value is MessageReactionKind {
  return MESSAGE_REACTIONS.some(reaction => reaction.kind === value)
}
export function summarizeMessageReactions(
  rows: readonly { kind: string; userId: string }[], viewerId: string,
): MessageReactionSummary[] {
  return MESSAGE_REACTIONS.flatMap(({ kind }) => {
    const matching = rows.filter(row => row.kind === kind)
    return matching.length ? [{ kind, count: matching.length, mine: matching.some(row => row.userId === viewerId) }] : []
  })
}
export function messageReactionCopy(locale: string) {
  if (locale === 'ko') return { label: '리액션', error: '리액션을 저장하지 못했습니다. 다시 시도해 주세요.', like: '좋아요', heart: '하트', check: '확인', sad: '슬퍼요', laugh: '웃음' }
  if (locale === 'ja') return { label: 'リアクション', error: 'リアクションを保存できませんでした。もう一度お試しください。', like: 'いいね', heart: 'ハート', check: '確認', sad: '悲しい', laugh: '笑い' }
  return { label: 'Reactions', error: 'Could not save your reaction. Please try again.', like: 'Like', heart: 'Heart', check: 'Check', sad: 'Sad', laugh: 'Laugh' }
}
