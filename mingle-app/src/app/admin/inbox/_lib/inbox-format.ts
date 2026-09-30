import { getSttLanguageDisplayName } from '@/lib/stt-languages'

/** Pure display helpers for the admin inbox (Korean-only admin UI). */

type PersonLike = { name?: string | null; handle?: string | null }

/** Name, else @handle, else a neutral placeholder. */
export function inboxPersonLabel(person: PersonLike | null | undefined): string {
  const name = person?.name?.trim()
  if (name) return name
  const handle = person?.handle?.trim()
  return handle ? `@${handle}` : '알 수 없음'
}

/** "João", "João, Ana", "João, Ana 외 2명"; no counterpart -> "상대 없음". */
export function inboxCounterpartTitle(counterparts: PersonLike[]): string {
  if (counterparts.length === 0) return '상대 없음'
  const names = counterparts.map(inboxPersonLabel)
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} 외 ${names.length - 2}명`
}

/** "포르투갈어" for "pt"; the code itself when unknown. */
export function inboxLanguageName(code: string | null | undefined): string {
  if (!code) return '알 수 없는 언어'
  return getSttLanguageDisplayName(code, 'ko') || code
}

function startOfLocalDay(ms: number): number {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * Card timestamp in the device's time zone: 방금 / N분 전 / N시간 전 (same
 * day) / 어제 / M월 D일 (this year) / YYYY. M. D.
 */
export function formatInboxRelativeTime(iso: string | null | undefined, nowMs: number): string {
  const ms = iso ? Date.parse(iso) : Number.NaN
  if (!Number.isFinite(ms)) return ''
  const diffMs = Math.max(0, nowMs - ms)
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return '방금'
  if (minutes < 60) return `${minutes}분 전`
  const today = startOfLocalDay(nowMs)
  if (ms >= today) return `${Math.floor(minutes / 60)}시간 전`
  const yesterday = startOfLocalDay(today - 1)
  if (ms >= yesterday) return '어제'
  const date = new Date(ms)
  if (date.getFullYear() === new Date(nowMs).getFullYear()) return `${date.getMonth() + 1}월 ${date.getDate()}일`
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`
}

/** Badge count text: 1-99, then "99+". */
export function formatInboxUnreadCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return ''
  return count > 99 ? '99+' : String(Math.floor(count))
}
