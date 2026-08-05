export const ADMIN_DASHBOARD_DEFAULT_DAYS = 30;
// app_messages.created_at etc. are stored as naive UTC instants, so bucket
// days in UTC too -- matches the DB's own basis instead of converting.
export const ADMIN_DASHBOARD_TIME_ZONE = "UTC";
export const ADMIN_DASHBOARD_RANGE_OPTIONS = [7, 30, 90] as const;

export type AdminDashboardRange = (typeof ADMIN_DASHBOARD_RANGE_OPTIONS)[number];

export function normalizeDashboardDays(value: unknown): AdminDashboardRange {
  const parsed = Number(value);
  const match = ADMIN_DASHBOARD_RANGE_OPTIONS.find((option) => option === parsed);
  return match ?? ADMIN_DASHBOARD_DEFAULT_DAYS;
}

/** 서버 로컬 타임존과 무관하게 지정 타임존의 '오늘'을 구한다. en-CA는 YYYY-MM-DD로 포맷된다. */
export function resolveTodayKey(now: Date, timeZone: string = ADMIN_DASHBOARD_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

/** dayKey(해당 타임존 자정)에 해당하는 UTC 시각. */
export function startOfDayUtc(dayKey: string, utcOffsetHours = 0): Date {
  const parsed = parseDayKey(dayKey);
  parsed.setUTCHours(parsed.getUTCHours() - utcOffsetHours);
  return parsed;
}

export type MetricKind = "count" | "seconds" | "milliseconds";

export type DailyPoint = {
  day: string;
  value: number | null;
};

export type DailyRow = {
  day: string;
  value: number | null;
};

export type DashboardMetric = {
  key: string;
  label: string;
  unit: string;
  kind: MetricKind;
  /** 지연시간처럼 낮을수록 좋은 지표는 델타 색을 뒤집는다. */
  lowerIsBetter: boolean;
  points: DailyPoint[];
  /** 두 번째 시리즈(p95 등). 있으면 차트에 2번째 라인 + 범례로 같이 뜬다. */
  secondarySeries?: { label: string; points: DailyPoint[] };
  latest: number | null;
  /** 델타 비교 기준값 — "전일"이 아니라 "7일 전" 같은 자리표시자와 비교한다. */
  previous: number | null;
  previousLabel: string;
  summaryLabel: string;
  summaryValue: number | null;
};

/** 주요 배포/인프라 변경 시점. 스크럼에서 그래프 보다가 바로 원인 짚을 수 있게 세로선으로 표시한다. */
export type DeployMarker = {
  date: string;
  label: string;
};

export const DEPLOY_MARKERS: DeployMarker[] = [
  { date: "2026-08-02", label: "PR #190 배포 (대화방 시퀀스 수정)" },
  { date: "2026-08-04", label: "Railway region → Southeast Asia" },
];

/**
 * dayKeys 범위 안에 있는 배포 마커만 x좌표로 변환한다. 범위 밖이면 null —
 * 화면에 없는 날짜에 선을 그리면 다른 그래프의 좌표계와 어긋나 보인다.
 */
export function resolveDeployMarkerX(
  dayKeys: readonly string[],
  markerDate: string,
  width: number,
): number | null {
  const index = dayKeys.indexOf(markerDate);
  if (index === -1) return null;
  const denominator = Math.max(1, dayKeys.length - 1);
  return dayKeys.length > 1 ? (index / denominator) * width : width / 2;
}

/** UTC 기준 YYYY-MM-DD. Date의 로컬 타임존에 의존하지 않도록 UTC 필드로만 계산한다. */
export function formatDayKey(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDayKey(dayKey: string): Date {
  const [year, month, day] = dayKey.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
}

export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const parsed = parseDayKey(dayKey);
  parsed.setUTCDate(parsed.getUTCDate() + deltaDays);
  return formatDayKey(parsed);
}

/** endDay를 마지막 항목으로 하는 오름차순 날짜 키 목록. */
export function enumerateDayKeys(endDay: string, days: number): string[] {
  const total = Math.max(1, Math.floor(days));
  const keys: string[] = [];
  for (let offset = total - 1; offset >= 0; offset -= 1) {
    keys.push(shiftDayKey(endDay, -offset));
  }
  return keys;
}

/**
 * 비어 있는 날짜를 채운다. 카운트 계열은 0이 진실이지만,
 * 평균 지연시간은 데이터가 없는 날을 0으로 채우면 거짓이 되므로 null로 둔다.
 */
export function fillDailySeries(
  rows: readonly DailyRow[],
  dayKeys: readonly string[],
  fillValue: number | null,
): DailyPoint[] {
  const byDay = new Map<string, number | null>();
  for (const row of rows) {
    byDay.set(row.day, row.value);
  }
  return dayKeys.map((day) => ({
    day,
    value: byDay.has(day) ? byDay.get(day) ?? null : fillValue,
  }));
}

export function formatCompactNumber(value: number): string {
  const absolute = Math.abs(value);
  if (absolute < 10_000) return value.toLocaleString("en-US");
  if (absolute < 1_000_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

export function formatSecondsAsDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const leftoverMinutes = minutes % 60;
  if (hours < 24) {
    return leftoverMinutes > 0 ? `${hours}시간 ${leftoverMinutes}분` : `${hours}시간`;
  }
  const days = Math.floor(hours / 24);
  const leftoverHours = hours % 24;
  return leftoverHours > 0 ? `${days}일 ${leftoverHours}시간` : `${days}일`;
}

export function formatMetricValue(value: number | null, kind: MetricKind): string {
  if (value === null) return "—";
  if (kind === "milliseconds") return `${Math.round(value).toLocaleString("en-US")}ms`;
  return formatCompactNumber(Math.round(value));
}

export function computeDeltaPercent(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export type DeltaTone = "good" | "bad" | "neutral";

export function resolveDeltaTone(deltaPercent: number | null, lowerIsBetter: boolean): DeltaTone {
  if (deltaPercent === null || Math.abs(deltaPercent) < 0.05) return "neutral";
  const rising = deltaPercent > 0;
  const helpful = lowerIsBetter ? !rising : rising;
  return helpful ? "good" : "bad";
}

export function formatDeltaPercent(deltaPercent: number | null): string {
  if (deltaPercent === null) return "—";
  const rounded = Math.round(deltaPercent * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(1)}%`;
}

/** 축 눈금이 1 / 2 / 5 × 10ⁿ 로만 떨어지게 올림한다. */
export function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export type ChartPoint = {
  x: number;
  y: number;
  day: string;
  value: number | null;
};

export type ChartGeometry = {
  linePath: string;
  areaPath: string;
  points: ChartPoint[];
  yMax: number;
  bandWidth: number;
};

/**
 * 데이터가 없는 날(null)에서 선을 끊는다. 없는 구간을 이어 그리면
 * 측정하지 않은 값을 측정한 것처럼 보여주게 된다.
 *
 * yMaxOverride: 같은 차트에 시리즈가 2개(예: 평균 + p95)일 때, 각자 따로
 * 스케일을 잡으면 축이 달라져 왜곡되므로 두 시리즈가 같은 yMax를 공유하게 한다.
 */
export function buildChartGeometry(
  points: readonly DailyPoint[],
  width: number,
  height: number,
  yMaxOverride?: number,
): ChartGeometry {
  const values = points
    .map((point) => point.value)
    .filter((value): value is number => value !== null);
  const yMax = yMaxOverride ?? niceCeil(values.length > 0 ? Math.max(...values) : 0);
  const denominator = Math.max(1, points.length - 1);
  const bandWidth = points.length > 1 ? width / denominator : width;

  const projected: ChartPoint[] = points.map((point, index) => ({
    x: points.length > 1 ? (index / denominator) * width : width / 2,
    y: point.value === null ? height : height - (point.value / yMax) * height,
    day: point.day,
    value: point.value,
  }));

  const runs: ChartPoint[][] = [];
  let currentRun: ChartPoint[] = [];
  for (const point of projected) {
    if (point.value === null) {
      if (currentRun.length > 0) runs.push(currentRun);
      currentRun = [];
      continue;
    }
    currentRun.push(point);
  }
  if (currentRun.length > 0) runs.push(currentRun);

  const linePath = runs
    .map((run) => run
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(" "))
    .join(" ");

  const areaPath = runs
    .filter((run) => run.length > 1)
    .map((run) => {
      const head = run[0];
      const tail = run[run.length - 1];
      const body = run
        .map((point) => `L${point.x.toFixed(2)},${point.y.toFixed(2)}`)
        .join(" ");
      return `M${head.x.toFixed(2)},${height} ${body} L${tail.x.toFixed(2)},${height} Z`;
    })
    .join(" ");

  return { linePath, areaPath, points: projected, yMax, bandWidth };
}

export function sumSeries(points: readonly DailyPoint[]): number {
  return points.reduce((total, point) => total + (point.value ?? 0), 0);
}

export function averageSeries(points: readonly DailyPoint[]): number | null {
  const values = points
    .map((point) => point.value)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}
