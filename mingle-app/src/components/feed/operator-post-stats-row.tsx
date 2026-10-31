import { operatorPostStatsCopy } from "@/i18n/operator-post-stats-copy";
import {
  OPERATOR_POST_STAT_KEYS,
  conversionRate,
  formatConversionRate,
  formatStatCount,
  type OperatorPostStats,
} from "@/lib/operator-post-stats";

/**
 * Staff-only stats of an operator post on its app feed card, above the author
 * row: each count, and every count but the views as a share of the views.
 * Rendered only with stats the server handed to this viewer
 * (`use-operator-post-stats.ts`). The dark glass chip is the card's own
 * overlay style (the archived/trash label), so it reads on any background.
 */
export default function OperatorPostStatsRow({ stats, locale }: { stats: OperatorPostStats; locale: string }) {
  const copy = operatorPostStatsCopy(locale);
  return (
    <dl
      aria-label={copy.title}
      title={copy.title}
      className="mb-2 grid grid-cols-3 gap-x-3 gap-y-1.5 rounded-xl bg-black/55 px-3 py-2 text-white backdrop-blur-sm"
    >
      {OPERATOR_POST_STAT_KEYS.map((key) => (
        <div key={key} className="min-w-0">
          <dt className="truncate text-[11px] font-medium leading-4 text-white/70">{copy.labels[key]}</dt>
          <dd className="truncate text-[13px] font-semibold leading-5 tabular-nums">
            {formatStatCount(stats[key], locale)}
            {key === "views" ? null : (
              <span className="ml-1 text-[11px] font-medium text-white/70">
                {formatConversionRate(conversionRate(stats[key], stats.views), locale)}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
