import {
  OPERATOR_POST_STAT_KEYS,
  conversionRate,
  formatConversionRate,
  formatStatCount,
  type OperatorPostStatKey,
  type OperatorPostStats,
} from '@/lib/operator-post-stats'

export const OPERATOR_POST_STAT_LABELS: Record<OperatorPostStatKey, string> = {
  views: '조회',
  likes: '좋아요',
  comments: '댓글',
  follows: '팔로우',
  profileVisits: '프로필 방문',
  messages: '메시지',
}

/** One count, with its share of the views under every count but the views. */
export function OperatorPostStatValue({ stats, statKey }: { stats: OperatorPostStats; statKey: OperatorPostStatKey }) {
  return (
    <>
      {formatStatCount(stats[statKey])}
      {statKey === 'views' ? null : (
        <span className="ml-1 text-xs font-medium text-slate-500">{formatConversionRate(conversionRate(stats[statKey], stats.views))}</span>
      )}
    </>
  )
}

/**
 * The stats row under an operator post in the admin tool: people who saw the
 * post, and how many of them liked, commented, followed, opened the profile
 * from it and sent a first message (real users only; see
 * `src/lib/operator-post-stats.ts`). Laid out like the dashboard table's
 * label/value cells. Nothing without stats (not an operator post).
 */
export function OperatorPostStatsRow({ stats, className = '' }: { stats: OperatorPostStats | null | undefined; className?: string }) {
  if (!stats) return null
  return (
    <dl aria-label="글 반응 (실사용자)" className={`grid grid-cols-3 gap-x-4 gap-y-2 rounded-xl bg-slate-50 px-3 py-2.5 sm:grid-cols-6 ${className}`}>
      {OPERATOR_POST_STAT_KEYS.map((key) => (
        <div key={key} className="min-w-0">
          <dt className="break-words text-xs text-slate-500">{OPERATOR_POST_STAT_LABELS[key]}</dt>
          <dd className="break-words text-sm font-semibold tabular-nums text-slate-900">
            <OperatorPostStatValue stats={stats} statKey={key} />
          </dd>
        </div>
      ))}
    </dl>
  )
}
