export const MESSAGE_REACTIONS = [
  { kind: 'like', emoji: '👍' },
  { kind: 'heart', emoji: '❤️' },
  { kind: 'check', emoji: '✅' },
  { kind: 'sad', emoji: '😢' },
  { kind: 'laugh', emoji: '😂' },
] as const
export type MessageReactionKind = typeof MESSAGE_REACTIONS[number]['kind']
export type MessageReactionSummary = { kind: MessageReactionKind; count: number; mine: boolean }
export type MessageReactionParticipant = { id: string; name: string | null; handle: string; mine: boolean }
export type MessageReactionParticipantsPage = { participants: MessageReactionParticipant[]; nextCursor: string | null }
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
  if (locale === 'ko') return { label: '리액션', participants: '반응한 사람', close: '닫기', loading: '불러오는 중…', loadError: '목록을 불러오지 못했습니다.', retry: '다시 시도', more: '더 보기', empty: '아직 반응한 사람이 없습니다.', me: '나', hint: '길게 눌러 반응한 사람 보기', error: '리액션을 저장하지 못했습니다. 다시 시도해 주세요.', like: '좋아요', heart: '하트', check: '확인', sad: '슬퍼요', laugh: '웃음' }
  if (locale === 'ja') return { label: 'リアクション', participants: 'リアクションした人', close: '閉じる', loading: '読み込み中…', loadError: '一覧を読み込めませんでした。', retry: '再試行', more: 'もっと見る', empty: 'まだリアクションはありません。', me: '自分', hint: '長押しでリアクションした人を表示', error: 'リアクションを保存できませんでした。もう一度お試しください。', like: 'いいね', heart: 'ハート', check: '確認', sad: '悲しい', laugh: '笑い' }
  return { label: 'Reactions', participants: 'Reacted by', close: 'Close', loading: 'Loading…', loadError: 'Could not load the list.', retry: 'Try again', more: 'Load more', empty: 'No reactions yet.', me: 'You', hint: 'Hold to see who reacted', error: 'Could not save your reaction. Please try again.', like: 'Like', heart: 'Heart', check: 'Check', sad: 'Sad', laugh: 'Laugh' }
}
