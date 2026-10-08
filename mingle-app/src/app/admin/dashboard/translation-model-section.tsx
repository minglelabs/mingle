import {
  ADMIN_DASHBOARD_CHART_HEIGHT,
  ADMIN_DASHBOARD_WIDE_CHART_WIDTH,
  type AdminDashboardDateRange,
  type AdminDashboardPlatform,
  OTHER_TRANSLATION_MODEL_SERIES_KEY,
  type TranslationModelSeries,
  type TranslationModelSeriesKey,
  buildSharedScaleChartGeometries,
} from "@/lib/admin-dashboard-metrics";
import { loadTranslationModelMessageSeries } from "@/lib/admin-dashboard-query";
import type { UserSelectableTranslationModel } from "@/lib/translation-models";
import { MultiLineChartCard, MultiLineChartCardPlaceholder } from "./multi-line-chart-card";

const CHART_LABEL = "번역 모델별 메시지수";

/** Keyed by model, so a new selectable model without a colour is a type error rather than
 * a silently reused colour. */
const TRANSLATION_MODEL_COLORS: Record<UserSelectableTranslationModel, string> = {
  "gemini-2.5-flash-lite": "#2a78d6",
  "qwen/qwen3.5-9b": "#1baf7a",
  "gpt-6-luna": "#8b5cf6",
  "claude-haiku-5-5": "#e0457b",
};
const OTHER_TRANSLATION_MODEL_COLOR = "#898781";

/** Colour of a series, fixed per model so it does not change when another model drops
 * out of the range; "기타" is a neutral gray. */
export function resolveTranslationModelColor(key: TranslationModelSeriesKey): string {
  return key === OTHER_TRANSLATION_MODEL_SERIES_KEY ? OTHER_TRANSLATION_MODEL_COLOR : TRANSLATION_MODEL_COLORS[key];
}

/**
 * Starts the live query without awaiting it, so the page can run it alongside its other
 * data and hand the promise to TranslationModelSection. A no-op handler goes on at once:
 * a failure that lands before the section awaits the promise must not surface as an
 * unhandled rejection -- the section is what reports it.
 */
export function startTranslationModelSeriesLoad(
  range: AdminDashboardDateRange,
  platform: AdminDashboardPlatform,
): Promise<TranslationModelSeries[]> {
  const series = loadTranslationModelMessageSeries(range, { platform });
  series.catch(() => undefined);
  return series;
}

function TranslationModelChart({ series, dayKeys }: { series: TranslationModelSeries[]; dayKeys: string[] }) {
  // One y-scale across every model so their line heights compare directly.
  const { yMax, geometries } = buildSharedScaleChartGeometries(
    series.map((entry) => entry.points),
    ADMIN_DASHBOARD_WIDE_CHART_WIDTH,
    ADMIN_DASHBOARD_CHART_HEIGHT,
  );

  return (
    <MultiLineChartCard
      label={CHART_LABEL}
      kind="count"
      ariaLabel={`${CHART_LABEL} 일별 추이`}
      dayKeys={dayKeys}
      yMax={yMax}
      emptyMessage="번역된 메시지 없음"
      series={series.map((entry, index) => ({
        key: entry.key,
        label: entry.label,
        color: resolveTranslationModelColor(entry.key),
        points: geometries[index].points,
        linePath: geometries[index].linePath,
        total: entry.total,
        share: entry.share,
      }))}
    />
  );
}

/**
 * The translation-model chart, rendered under its own Suspense boundary so the rest of the
 * dashboard never waits for this live query. A failure is contained here -- logged, and
 * shown inside the card -- because the route has no error boundary, and an error thrown
 * from here would fail the whole page.
 */
export async function TranslationModelSection({
  seriesPromise,
  dayKeys,
}: {
  seriesPromise: Promise<TranslationModelSeries[]>;
  dayKeys: string[];
}) {
  let series: TranslationModelSeries[] | null = null;
  try {
    series = await seriesPromise;
  } catch (error) {
    console.error("[admin-dashboard] translation_model_series_failed", error);
  }

  if (!series) {
    return (
      <MultiLineChartCardPlaceholder
        label={CHART_LABEL}
        status="error"
        message="번역 모델별 데이터를 불러오지 못했습니다."
      />
    );
  }
  return <TranslationModelChart series={series} dayKeys={dayKeys} />;
}

/** Suspense fallback: the chart card's own frame, so nothing shifts when the data arrives. */
export function TranslationModelSectionFallback() {
  return <MultiLineChartCardPlaceholder label={CHART_LABEL} status="loading" message="불러오는 중..." />;
}
