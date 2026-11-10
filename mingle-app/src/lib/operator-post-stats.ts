/**
 * Engagement stats of one operator account's post (staff-only data: the admin
 * tool, the admin dashboard, and in the app only for staff, see
 * `/admin/api/post-stats`). Shared by the server loader and every surface that
 * shows them, so the counts and the rates are computed one way.
 *
 * Every count is of distinct real people: operator accounts, the official
 * account, staff app accounts (admin notify targets) and the author are left
 * out. How follows and messages are tied to a post is documented in
 * `src/server/operator-post-stats/attribution.ts`.
 */
export type OperatorPostStats = {
  /** People who saw the post (PostView: 1 s on screen, a like or a comment). */
  views: number
  likes: number
  /** People who commented or replied (not the number of comments). */
  comments: number
  /** Follows of the author credited to this post. */
  follows: number
  /** People who opened the author's profile from this post. */
  profileVisits: number
  /** People whose first message to the author is credited to this post. */
  messages: number
}

/** The counts shown as a share of the views, in display order. */
export const OPERATOR_POST_RATE_KEYS = ['likes', 'comments', 'follows', 'profileVisits', 'messages'] as const

export type OperatorPostRateKey = (typeof OPERATOR_POST_RATE_KEYS)[number]

/** Every count in display order: views first, then the rated counts. */
export const OPERATOR_POST_STAT_KEYS = ['views', ...OPERATOR_POST_RATE_KEYS] as const

export type OperatorPostStatKey = (typeof OPERATOR_POST_STAT_KEYS)[number]

export const EMPTY_OPERATOR_POST_STATS: OperatorPostStats = Object.freeze({
  views: 0,
  likes: 0,
  comments: 0,
  follows: 0,
  profileVisits: 0,
  messages: 0,
})

/** `count / views` (0..), or null without views. Not capped at 1. */
export function conversionRate(count: number, views: number): number | null {
  if (!Number.isFinite(count) || !Number.isFinite(views) || views <= 0) return null
  return Math.max(0, count) / views
}

function numberFormat(locale: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(locale, options)
  } catch {
    return new Intl.NumberFormat('en', options)
  }
}

/**
 * A rate as a percentage with at most one decimal ("12.5%"), "<0.1%" for a
 * tiny non-zero rate, "-" without views. `locale` picks the digits and
 * separators (the admin tool uses the default, Korean).
 */
export function formatConversionRate(rate: number | null, locale = 'ko-KR'): string {
  if (rate === null || !Number.isFinite(rate)) return '-'
  const format = numberFormat(locale, { style: 'percent', maximumFractionDigits: 1, minimumFractionDigits: 0 })
  if (rate > 0 && rate < 0.001) return `<${format.format(0.001)}`
  return format.format(rate)
}

export function formatStatCount(value: number, locale = 'ko-KR'): string {
  return numberFormat(locale).format(Math.max(0, Math.round(Number.isFinite(value) ? value : 0)))
}

/** Column-wise sum, for totals over several posts (rates are then sum / sum of views). */
export function sumOperatorPostStats(rows: Iterable<OperatorPostStats>): OperatorPostStats {
  const total = { ...EMPTY_OPERATOR_POST_STATS }
  for (const row of rows) {
    for (const key of OPERATOR_POST_STAT_KEYS) total[key] += row[key]
  }
  return total
}
