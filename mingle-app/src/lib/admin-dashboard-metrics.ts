export const ADMIN_DASHBOARD_DEFAULT_DAYS = 30;
export const ADMIN_DASHBOARD_MAX_DAYS = 365;
// app_messages.created_at etc. are stored as naive UTC instants, so bucket
// days in UTC too -- matches the DB's own basis instead of converting.
export const ADMIN_DASHBOARD_TIME_ZONE = "UTC";
export const ADMIN_DASHBOARD_PRESET_OPTIONS = [7, 30, 90] as const;
/** @deprecated Use ADMIN_DASHBOARD_PRESET_OPTIONS */
export const ADMIN_DASHBOARD_RANGE_OPTIONS = ADMIN_DASHBOARD_PRESET_OPTIONS;

/** Logical chart plot area, in svg units. Shared by the server-side geometry builder
 * (buildChartGeometry) and the client hover component so their coordinate spaces
 * always agree -- letting them drift apart would silently break hover positioning. */
export const ADMIN_DASHBOARD_CHART_WIDTH = 560;
export const ADMIN_DASHBOARD_CHART_HEIGHT = 140;

/**
 * 오늘 + 어제는 데이터가 아직 완전히 집계되지 않을 수 있으므로 캐시 대상에서 제외한다.
 * 이 값 = 실시간으로 항상 재집계할 최근 N일 수.
 */
export const ADMIN_DASHBOARD_UNCACHEABLE_TRAILING_DAYS = 2;

/** 프리셋([7, 30, 90])과 커스텀 숫자(1~365)를 모두 포괄하는 기간 타입. */
export type AdminDashboardRange = number;

export function normalizeDashboardDays(value: unknown): AdminDashboardRange {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return ADMIN_DASHBOARD_DEFAULT_DAYS;
  return Math.min(ADMIN_DASHBOARD_MAX_DAYS, Math.round(parsed));
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

export type AdminDashboardDateRange = {
  dayKeys: string[];
  rangeStart: Date;
  rangeEnd: Date;
};

/** 지표 쿼리(Postgres)와 배포 마커 쿼리(GitHub) 둘 다 같은 날짜 범위를 써야 그래프의
 * x축과 마커 위치가 어긋나지 않는다 -- 각자 따로 계산하면 드리프트가 생기므로 여기 하나로 통일. */
export function resolveAdminDashboardRange(now: Date, days: AdminDashboardRange): AdminDashboardDateRange {
  const todayKey = resolveTodayKey(now, ADMIN_DASHBOARD_TIME_ZONE);
  const dayKeys = enumerateDayKeys(todayKey, days);
  const rangeStart = startOfDayUtc(dayKeys[0]);
  const rangeEnd = startOfDayUtc(todayKey);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
  return { dayKeys, rangeStart, rangeEnd };
}

/**
 * 캐시 저장/조회 대상에서 제외할 날짜 키 집합을 반환한다.
 * 오늘과 어제는 데이터가 아직 완전히 정산되지 않을 수 있으므로 항상 실시간 집계한다.
 */
export function resolveUncacheableDayKeys(
  now: Date,
  timeZone: string = ADMIN_DASHBOARD_TIME_ZONE,
  trailingDays: number = ADMIN_DASHBOARD_UNCACHEABLE_TRAILING_DAYS,
): Set<string> {
  const todayKey = resolveTodayKey(now, timeZone);
  const keys = new Set<string>();
  for (let i = 0; i < trailingDays; i += 1) {
    keys.add(shiftDayKey(todayKey, -i));
  }
  return keys;
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
  points: DailyPoint[];
  /** 두 번째 시리즈(p95 등). 있으면 차트에 2번째 라인 + 범례로 같이 뜬다. */
  secondarySeries?: { label: string; points: DailyPoint[] };
};

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

/** 표/그래프/카드 어디서 보여주든 같은 규칙: "초" 단위 지표만 사람이 읽는 기간(시/분)으로,
 * 나머지는 formatMetricValue 그대로. */
export function formatMetricDisplayValue(value: number | null, kind: MetricKind): string {
  if (kind === "seconds" && value !== null) return formatSecondsAsDuration(value);
  return formatMetricValue(value, kind);
}

export function formatShortDay(dayKey: string): string {
  const [, month, day] = dayKey.split("-");
  return `${month}/${day}`;
}

export type XAxisTick = { day: string; x: number };

/**
 * 날짜 눈금을 최대 maxTicks개까지 균등 간격으로 뽑는다. 매일 다 찍으면
 * 90일 차트에서 라벨이 겹치므로, hover 없이도 몇 개 지점은 바로 읽히게
 * 하는 타협점이다 (첫날/마지막날은 항상 포함).
 */
export function resolveXAxisTicks(dayKeys: readonly string[], width: number, maxTicks = 6): XAxisTick[] {
  if (dayKeys.length === 0) return [];
  if (dayKeys.length === 1) return [{ day: dayKeys[0], x: width / 2 }];

  const tickCount = Math.min(maxTicks, dayKeys.length);
  const denominator = dayKeys.length - 1;
  const seenIndexes = new Set<number>();
  const ticks: XAxisTick[] = [];
  for (let i = 0; i < tickCount; i += 1) {
    const index = Math.round((i * denominator) / (tickCount - 1));
    if (seenIndexes.has(index)) continue;
    seenIndexes.add(index);
    ticks.push({ day: dayKeys[index], x: (index / denominator) * width });
  }
  return ticks;
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

/** 일별 값을 누적 합으로 변환한다 (null은 0으로 취급 — 카운트 계열만 쓰는 용도라 안전하다). */
export function buildCumulativeSeries(points: readonly DailyPoint[]): DailyPoint[] {
  let running = 0;
  return points.map((point) => {
    running += point.value ?? 0;
    return { day: point.day, value: running };
  });
}

export function averageSeries(points: readonly DailyPoint[]): number | null {
  const values = points
    .map((point) => point.value)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}
