import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminDashboardDateRange } from "./admin-dashboard-metrics";
import {
  formatDayKey,
  parseDayKey,
  resolveAdminDashboardRange,
  resolveTodayKey,
  shiftDayKey,
  startOfDayUtc,
} from "./admin-dashboard-metrics";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  upsert: vi.fn(),
  queryRawUnsafe: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminDashboardDailyMetric: {
      findMany: mocks.findMany,
      deleteMany: mocks.deleteMany,
      upsert: mocks.upsert,
    },
    $queryRawUnsafe: mocks.queryRawUnsafe,
  },
}));

import {
  clearAdminDashboardCache,
  DAILY_METRIC_CACHE_CHUNK_DAYS,
  loadAdminDashboardMetrics,
  loadTranslationModelMessageSeries,
} from "./admin-dashboard-query";

function makeRange(dayKeys: string[]): AdminDashboardDateRange {
  const rangeStart = startOfDayUtc(dayKeys[0]);
  const rangeEnd = startOfDayUtc(dayKeys[dayKeys.length - 1]);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
  return { dayKeys, rangeStart, rangeEnd };
}

function rawDay(dayKey: string): Date {
  return parseDayKey(dayKey);
}

/** Collapses whitespace so SQL assertions pin the statement, not its indentation. */
function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

/** The FROM ... WHERE part of a normalized count query. */
function sqlSource(sql: string): string {
  return sql.slice(sql.indexOf(" from ") + 1, sql.indexOf(" group by "));
}

function setRawMetricResults(dayKey: string): void {
  mocks.queryRawUnsafe
    .mockResolvedValueOnce([{ day: rawDay(dayKey), value: BigInt(2) }])
    .mockResolvedValueOnce([{ day: rawDay(dayKey), value: BigInt(3) }])
    .mockResolvedValueOnce([{ day: rawDay(dayKey), value: BigInt(4) }])
    .mockResolvedValueOnce([{ day: rawDay(dayKey), value: 5 }])
    .mockResolvedValueOnce([{ day: rawDay(dayKey), avg_ms: 100, p95_ms: 180 }])
    .mockResolvedValueOnce([{ day: rawDay(dayKey), avg_ms: 220, p95_ms: 360 }])
    .mockResolvedValueOnce([{ day: rawDay(dayKey), avg_ms: 90, p95_ms: 240 }])
    .mockResolvedValueOnce([{ day: rawDay(dayKey), avg_ms: 30, p95_ms: 50 }]);
}

type RawMetricRow = { day: Date; value: bigint; avg_ms: number; p95_ms: number };

/**
 * One row per UTC day in [start, end) that fits every metric query (count `value`,
 * latency `avg_ms`/`p95_ms`). The figures come from the day of the month, so each day's
 * numbers are distinct whichever batch computed them.
 */
function rowsForEveryDay(start: Date, end: Date): RawMetricRow[] {
  const rows: RawMetricRow[] = [];
  for (const cursor = new Date(start); cursor.getTime() < end.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const dayOfMonth = cursor.getUTCDate();
    rows.push({ day: new Date(cursor), value: BigInt(dayOfMonth), avg_ms: dayOfMonth * 10, p95_ms: dayOfMonth * 20 });
  }
  return rows;
}

function dayOfMonth(dayKey: string): number {
  return Number(dayKey.slice(8));
}

/** Contiguous dayKeys split into the chunks the loader computes and stores one after another. */
function toChunks(dayKeys: readonly string[]): string[][] {
  const chunks: string[][] = [];
  for (let start = 0; start < dayKeys.length; start += DAILY_METRIC_CACHE_CHUNK_DAYS) {
    chunks.push(dayKeys.slice(start, start + DAILY_METRIC_CACHE_CHUNK_DAYS));
  }
  return chunks;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("loadAdminDashboardMetrics", () => {
  it.each(["all", "android"] as const)(
    "leaves operator accounts out of signups, DAU, messages and latency (%s)",
    async (platform) => {
      const today = resolveTodayKey(new Date());
      setRawMetricResults(today);

      await loadAdminDashboardMetrics(makeRange([today]), { platform });

      const queries = mocks.queryRawUnsafe.mock.calls.map(([sql]) => sql as string);
      const operatorSender = 'and not exists (select 1 from "app"."app_users" as op where op."id" = m."user_id" and op."is_operator")';
      expect(queries[0]).toContain('"app"."app_users" as u');
      expect(queries[0]).toContain('and u."is_operator" = false');
      for (const index of [1, 2, 4, 5, 6, 7]) {
        expect(queries[index]).toContain('from "app"."app_messages" as m');
        expect(queries[index]).toContain(operatorSender);
      }
      // Messages without a sender stay in the count: NOT EXISTS, never NOT IN.
      expect(queries.join("\n")).not.toMatch(/not in \(/i);
      // Usage comes from client event logs, which operators never write.
      expect(queries[3]).not.toContain("is_operator");
    },
  );

  it("adds STT per character (5+ characters, weighted) and translation per output token", async () => {
    const today = resolveTodayKey(new Date());
    setRawMetricResults(today);

    const metrics = await loadAdminDashboardMetrics(makeRange([today]), { platform: "all" });

    const queries = mocks.queryRawUnsafe.mock.calls.map(([sql]) => normalizeSql(sql as string));
    expect(queries[6]).toContain(`join "app"."app_message_contents" as c on c."message_id" = m."id" and c."content_type" = 'SOURCE'`);
    expect(queries[6]).toContain("sum(stt_ms) / sum(chars) as avg_ms");
    expect(queries[6]).toContain("where chars >= 5");
    expect(queries[7]).toContain('m."translation_completion_tokens" > 0');
    expect(metrics.slice(6).map((metric) => [metric.key, metric.points[0].value, metric.secondarySeries?.points[0].value])).toEqual([
      ["stt_latency_ms_per_char", 90, 240],
      ["translation_latency_ms_per_token", 30, 50],
    ]);
  });

  it.each([
    ["all", "", ""],
    ["android", ` join "app"."app_users" as u on u."id" = m."user_id"`, ` and u."latest_client_platform" = $3`],
    ["ios", ` join "app"."app_users" as u on u."id" = m."user_id"`, ` and u."latest_client_platform" = $3`],
  ] as const)("counts messages with the message-count SQL, operator senders excluded (%s)", async (platform, join, platformFilter) => {
    const today = resolveTodayKey(new Date());
    setRawMetricResults(today);

    await loadAdminDashboardMetrics(makeRange([today]), { platform });

    const [query, ...params] = mocks.queryRawUnsafe.mock.calls[2] as [string, ...unknown[]];
    expect(normalizeSql(query)).toBe(normalizeSql(`
      select date_trunc('day', m."created_at") as day, count(*) as value
      from "app"."app_messages" as m${join}
      where m."is_deleted" is distinct from true
        and m."created_at" >= $1 and m."created_at" < $2
        and not exists (select 1 from "app"."app_users" as op where op."id" = m."user_id" and op."is_operator")${platformFilter}
      group by day
      order by day
    `));
    expect(params).toHaveLength(platform === "all" ? 2 : 3);
  });

  it("uses one indexed pre-range usage snapshot per active session instead of scanning all history", async () => {
    const today = resolveTodayKey(new Date());
    setRawMetricResults(today);

    await loadAdminDashboardMetrics(makeRange([shiftDayKey(today, -1), today]));

    const usageQuery = mocks.queryRawUnsafe.mock.calls[3][0] as string;
    const baselineQuery = usageQuery.split("usage_before_start as materialized (")[1]
      .split("usage_daily as materialized (")[0];
    expect(baselineQuery).toContain("from usage_first_in_range as first");
    expect(baselineQuery).toContain("left join lateral (");
    expect(baselineQuery).toContain('el."user_id" = first."user_id"');
    expect(baselineQuery).toContain('el."session_key" = first."session_key"');
    expect(baselineQuery).toContain('where first."session_key" is not null');
    expect(baselineQuery).toContain('and el."session_key" is null');
    expect(baselineQuery).toContain('where first."session_key" is null');
    expect(baselineQuery).toContain('el."usage_sec" is not null');
    expect(baselineQuery).toContain('el."created_at" < $1');
    expect(baselineQuery).toContain('order by el."created_at" desc, el."id" desc');
    expect(baselineQuery).toContain("limit 1");
    expect(baselineQuery).not.toContain("distinct on");
  });

  it("uses per-session daily high-water marks for usage snapshots", async () => {
    const today = resolveTodayKey(new Date());
    setRawMetricResults(today);

    await loadAdminDashboardMetrics(makeRange([today]));

    const usageQuery = mocks.queryRawUnsafe.mock.calls[3][0] as string;
    expect(usageQuery).toContain('max(el."usage_sec") as "usage_sec"');
    expect(usageQuery).toContain('(array_agg(el."usage_sec" order by el."created_at" asc, el."id" asc))[1] as "first_usage_sec"');
    expect(usageQuery).toContain('group by el."user_id", el."session_key", date_trunc(\'day\', el."created_at")');
    expect(usageQuery).toContain('coalesce(baseline."usage_sec", first."first_usage_sec")');
    expect(usageQuery).toContain('partition by "user_id", "session_key"');
  });

  it.each(["all", "android", "ios"] as const)(
    "reuses all 28 historical cache days and queries only the latest two days for %s",
    async (platform) => {
      const range = resolveAdminDashboardRange(new Date(), 30);
      const historicalDays = range.dayKeys.slice(0, -2);
      mocks.findMany.mockResolvedValue(historicalDays.map((day) => ({
        day: rawDay(day),
        signupCount: 9,
        dauCount: 8,
        messageCount: 7,
        usageSeconds: 6,
        usageMetricVersion: 3,
        sttAvgMs: null,
        sttP95Ms: null,
        translationAvgMs: null,
        translationP95Ms: null,
      })));
      setRawMetricResults(range.dayKeys[29]);

      const metrics = await loadAdminDashboardMetrics(range, { platform });

      expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { day: { in: historicalDays.map(parseDayKey) }, platform },
      }));
      expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(8);
      for (const [, start, end, selectedPlatform] of mocks.queryRawUnsafe.mock.calls) {
        expect(start).toEqual(startOfDayUtc(range.dayKeys[28]));
        expect(end).toEqual(range.rangeEnd);
        expect(selectedPlatform).toBe(platform === "all" ? undefined : platform);
      }
      expect(metrics[0].points.slice(0, 28).map((point) => point.value)).toEqual(Array(28).fill(6));
      expect(mocks.upsert).not.toHaveBeenCalled();
      expect(mocks.deleteMany).not.toHaveBeenCalled();
    },
  );

  it("uses cached daily rows without querying source tables for historical days", async () => {
    const dayKeys = ["2026-08-02", "2026-08-03", "2026-08-04"];
    mocks.findMany.mockResolvedValue(dayKeys.map((day, index) => ({
      day: rawDay(day),
      signupCount: index + 1,
      dauCount: index + 2,
      messageCount: index + 3,
      usageSeconds: index + 4,
      usageMetricVersion: 3,
      sttAvgMs: index + 5,
      sttP95Ms: index + 6,
      translationAvgMs: index + 7,
      translationP95Ms: index + 8,
    })));

    const metrics = await loadAdminDashboardMetrics(makeRange(dayKeys));

    expect(mocks.queryRawUnsafe).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(metrics[0].points.map((point) => point.value)).toEqual([4, 5, 6]);
    expect(metrics[1].points.map((point) => point.value)).toEqual([3, 4, 5]);
    expect(metrics[2].points.map((point) => point.value)).toEqual([2, 3, 4]);
    expect(metrics[3].points.map((point) => point.value)).toEqual([1, 2, 3]);
    expect(metrics[4].points.map((point) => point.value)).toEqual([5, 6, 7]);
    expect(metrics[4].secondarySeries?.points.map((point) => point.value)).toEqual([6, 7, 8]);
  });

  it("calculates a historical cache hole separately without recalculating cached days between it and today", async () => {
    const range = resolveAdminDashboardRange(new Date(), 30);
    const missingDay = range.dayKeys[3];
    mocks.findMany.mockResolvedValue(range.dayKeys.slice(0, -2)
      .filter((day) => day !== missingDay)
      .map((day) => ({
        day: rawDay(day), signupCount: 9, dauCount: 8, messageCount: 7,
        usageSeconds: 6, usageMetricVersion: 3, sttAvgMs: null, sttP95Ms: null,
        translationAvgMs: null, translationP95Ms: null,
      })));
    setRawMetricResults(missingDay);
    setRawMetricResults(range.dayKeys[29]);

    const metrics = await loadAdminDashboardMetrics(range, { platform: "android" });

    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(16);
    for (const [, start, end] of mocks.queryRawUnsafe.mock.calls.slice(0, 8)) {
      expect(start).toEqual(startOfDayUtc(missingDay));
      expect(end).toEqual(startOfDayUtc(shiftDayKey(missingDay, 1)));
    }
    for (const [, start, end] of mocks.queryRawUnsafe.mock.calls.slice(8)) {
      expect(start).toEqual(startOfDayUtc(range.dayKeys[28]));
      expect(end).toEqual(range.rangeEnd);
    }
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0].where.day_platform).toEqual({
      day: rawDay(missingDay), platform: "android",
    });
    expect(metrics[0].points[3].value).toBe(5);
    expect(metrics[0].points[4].value).toBe(6);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("calculates and stores every missing historical day", async () => {
    const dayKeys = ["2026-08-02", "2026-08-03", "2026-08-04"];
    mocks.findMany.mockResolvedValue([]);
    setRawMetricResults("2026-08-03");
    mocks.upsert.mockResolvedValue({});

    const metrics = await loadAdminDashboardMetrics(makeRange(dayKeys));

    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(8);
    const usageQuery = mocks.queryRawUnsafe.mock.calls[3][0] as string;
    expect(usageQuery).toContain('"app"."app_event_logs"');
    expect(usageQuery).toContain('"usage_sec"');
    expect(usageQuery).not.toContain('"app"."app_messages"');
    expect(mocks.upsert).toHaveBeenCalledTimes(3);
    expect(mocks.upsert.mock.calls[0][0].create).toMatchObject({
      day: rawDay("2026-08-02"),
      signupCount: 0,
      dauCount: 0,
      messageCount: 0,
      usageSeconds: 0,
      usageMetricVersion: 3,
      sttAvgMs: null,
      translationAvgMs: null,
    });
    expect(metrics[0].points.map((point) => point.value)).toEqual([0, 5, 0]);
    expect(metrics[1].points.map((point) => point.value)).toEqual([0, 4, 0]);
    expect(metrics[4].points.map((point) => point.value)).toEqual([null, 100, null]);
    expect(metrics[4].secondarySeries?.points.map((point) => point.value)).toEqual([null, 180, null]);
  });

  it("rebuilds a cache row written with an older usage metric", async () => {
    const dayKey = "2026-08-02";
    mocks.findMany.mockResolvedValue([{
      day: rawDay(dayKey),
      signupCount: 1,
      dauCount: 1,
      messageCount: 1,
      usageSeconds: 999999,
      usageMetricVersion: 1,
      sttAvgMs: 1,
      sttP95Ms: 1,
      translationAvgMs: 1,
      translationP95Ms: 1,
    }]);
    setRawMetricResults(dayKey);
    mocks.upsert.mockResolvedValue({});

    const metrics = await loadAdminDashboardMetrics(makeRange([dayKey]));

    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(8);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0].update).toMatchObject({
      usageSeconds: 5,
      usageMetricVersion: 3,
    });
    expect(metrics[0].points[0].value).toBe(5);
  });

  it("queries today and yesterday on the fly without saving them to DB cache", async () => {
    const today = resolveTodayKey(new Date());
    const yesterday = shiftDayKey(today, -1);
    setRawMetricResults(today);

    await loadAdminDashboardMetrics(makeRange([yesterday, today]));

    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(8);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("uses historical cache while recalculating today and yesterday", async () => {
    const today = resolveTodayKey(new Date());
    const yesterday = shiftDayKey(today, -1);
    const twoDaysAgo = shiftDayKey(today, -2);
    const dayKeys = [twoDaysAgo, yesterday, today];

    mocks.findMany.mockResolvedValue([{
      day: rawDay(twoDaysAgo),
      signupCount: 9,
      dauCount: 8,
      messageCount: 7,
      usageSeconds: 6,
      usageMetricVersion: 3,
      sttAvgMs: null,
      sttP95Ms: null,
      translationAvgMs: null,
      translationP95Ms: null,
    }]);
    setRawMetricResults(today);

    const metrics = await loadAdminDashboardMetrics(makeRange(dayKeys));

    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(8);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(metrics[0].points[0].value).toBe(6);
  });

  it("calculates and stores a missing platform-filtered cache row", async () => {
    const dayKey = "2026-08-02";
    mocks.findMany.mockResolvedValue([]);
    setRawMetricResults(dayKey);
    mocks.upsert.mockResolvedValue({});

    const metrics = await loadAdminDashboardMetrics(makeRange([dayKey]), { platform: "android" });

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ platform: "android" }),
    }));
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0].where.day_platform).toEqual({
      day: rawDay(dayKey),
      platform: "android",
    });
    expect(mocks.upsert.mock.calls[0][0].create.platform).toBe("android");
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(8);
    for (const [query, ...params] of mocks.queryRawUnsafe.mock.calls) {
      expect(query as string).toContain('"latest_client_platform" = $3');
      expect(params[2]).toBe("android");
    }
    expect(metrics[0].points[0].value).toBe(5);
    expect(metrics[1].points[0].value).toBe(4);
    expect(metrics[4].points[0].value).toBe(100);
  });

  it("uses platform-scoped historical cache while recalculating only recent days", async () => {
    const today = resolveTodayKey(new Date());
    const yesterday = shiftDayKey(today, -1);
    const twoDaysAgo = shiftDayKey(today, -2);
    const dayKeys = [twoDaysAgo, yesterday, today];

    mocks.findMany.mockResolvedValue([{
      day: rawDay(twoDaysAgo),
      signupCount: 9,
      dauCount: 8,
      messageCount: 7,
      usageSeconds: 6,
      usageMetricVersion: 3,
      sttAvgMs: null,
      sttP95Ms: null,
      translationAvgMs: null,
      translationP95Ms: null,
    }]);
    setRawMetricResults(yesterday);

    const metrics = await loadAdminDashboardMetrics(makeRange(dayKeys), { platform: "ios" });

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ platform: "ios" }),
    }));
    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(8);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(metrics[0].points.map((point) => point.value)).toEqual([6, 5, 0]);
  });

  it("forceRefresh deletes only cacheable days and recalculates everything, persisting only cacheable days", async () => {
    const today = resolveTodayKey(new Date());
    const yesterday = shiftDayKey(today, -1);
    const dayKeys = ["2026-08-02", "2026-08-03", yesterday, today];
    setRawMetricResults("2026-08-02");
    setRawMetricResults(today);
    mocks.deleteMany.mockResolvedValue({ count: 2 });
    mocks.upsert.mockResolvedValue({});

    const metrics = await loadAdminDashboardMetrics(makeRange(dayKeys), { forceRefresh: true });

    expect(mocks.findMany).not.toHaveBeenCalled();
    // The two cacheable days as one chunk, then yesterday and today live, never the months between.
    expect(mocks.queryRawUnsafe.mock.calls.map(([, start, end]) => [formatDayKey(start), formatDayKey(end)])).toEqual([
      ...Array(8).fill(["2026-08-02", "2026-08-04"]),
      ...Array(8).fill([yesterday, shiftDayKey(today, 1)]),
    ]);
    expect(mocks.deleteMany).toHaveBeenCalledTimes(1);
    const deletedDays: Date[] = mocks.deleteMany.mock.calls[0][0].where.day.in;
    expect(deletedDays).toHaveLength(2);
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.deleteMany.mock.calls[0][0].where.platform).toBe("all");
    expect(mocks.upsert.mock.calls.map(([args]) => args.where.day_platform)).toEqual([
      { day: rawDay("2026-08-02"), platform: "all" },
      { day: rawDay("2026-08-03"), platform: "all" },
    ]);
    expect(metrics[0].points.map((point) => point.value)).toEqual([5, 0, 0, 5]);
  });

  describe("filling the daily metric cache in chunks", () => {
    // These tests install persistent mock implementations; keep them out of other tests.
    beforeEach(() => {
      vi.resetAllMocks();
    });
    afterEach(() => {
      vi.resetAllMocks();
    });

    it.each([
      ["every cached row is from an older metric version", false],
      ["forceRefresh", true],
    ] as const)("computes and stores the cacheable days chunk by chunk when %s", async (_case, forceRefresh) => {
      const range = resolveAdminDashboardRange(new Date(), 30);
      const cacheableDays = range.dayKeys.slice(0, -2);
      const chunks = toChunks(cacheableDays);
      const events: string[] = [];
      // Production right after a USAGE_METRIC_VERSION bump: a row for every day, none usable.
      mocks.findMany.mockResolvedValue(cacheableDays.map((day) => ({
        day: rawDay(day), signupCount: 9, dauCount: 8, messageCount: 7,
        usageSeconds: 6, usageMetricVersion: 2, sttAvgMs: null, sttP95Ms: null,
        translationAvgMs: null, translationP95Ms: null,
      })));
      mocks.deleteMany.mockImplementation(async () => {
        events.push("delete");
        return { count: cacheableDays.length };
      });
      mocks.queryRawUnsafe.mockImplementation(async (_sql: string, start: Date, end: Date) => {
        events.push(`query ${formatDayKey(start)}..${formatDayKey(end)}`);
        return rowsForEveryDay(start, end);
      });
      mocks.upsert.mockImplementation(async (args) => {
        events.push(`store ${formatDayKey(args.where.day_platform.day)}`);
        return {};
      });

      const metrics = await loadAdminDashboardMetrics(range, { forceRefresh });

      const queryBatch = (first: string, last: string): string[] =>
        Array(8).fill(`query ${first}..${shiftDayKey(last, 1)}`);
      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk is stored before the next one is computed; yesterday and today come
      // last and are never stored.
      expect(events).toEqual([
        ...(forceRefresh ? ["delete"] : []),
        ...chunks.flatMap((chunk) => [
          ...queryBatch(chunk[0], chunk[chunk.length - 1]),
          ...chunk.map((day) => `store ${day}`),
        ]),
        ...queryBatch(range.dayKeys[28], range.dayKeys[29]),
      ]);
      expect(mocks.findMany).toHaveBeenCalledTimes(forceRefresh ? 0 : 1);
      // Every day keeps the figures of its own rows, whichever batch computed it.
      expect(metrics[0].points.map((point) => point.value)).toEqual(range.dayKeys.map(dayOfMonth));
      expect(metrics[4].points.map((point) => point.value)).toEqual(range.dayKeys.map((day) => dayOfMonth(day) * 10));
    });

    it("keeps the chunks stored before a failure, and the next load computes only the days still missing", async () => {
      const range = resolveAdminDashboardRange(new Date(), 30);
      const cacheableDays = range.dayKeys.slice(0, -2);
      const storedDayCount = 2 * DAILY_METRIC_CACHE_CHUNK_DAYS;
      const firstUnstoredDay = cacheableDays[storedDayCount];
      const storedRows: { day: Date }[] = [];
      mocks.queryRawUnsafe.mockImplementation(async (_sql: string, start: Date, end: Date) => {
        if (formatDayKey(start) === firstUnstoredDay) {
          throw new Error("canceling statement due to statement timeout");
        }
        return rowsForEveryDay(start, end);
      });
      mocks.upsert.mockImplementation(async (args) => {
        storedRows.push(args.create);
        return {};
      });
      mocks.findMany.mockResolvedValueOnce([]);

      await expect(loadAdminDashboardMetrics(range)).rejects.toThrow("statement timeout");
      expect(storedRows.map((row) => formatDayKey(row.day))).toEqual(cacheableDays.slice(0, storedDayCount));

      // The next load reads those rows back from the cache table and starts where the
      // failed one stopped.
      mocks.queryRawUnsafe.mockReset();
      mocks.queryRawUnsafe.mockImplementation(async (_sql: string, start: Date, end: Date) => rowsForEveryDay(start, end));
      mocks.upsert.mockReset();
      mocks.upsert.mockResolvedValue({});
      mocks.findMany.mockResolvedValueOnce([...storedRows]);

      const metrics = await loadAdminDashboardMetrics(range);

      const queriedFrom = mocks.queryRawUnsafe.mock.calls.map(([, start]) => formatDayKey(start));
      expect(queriedFrom[0]).toBe(firstUnstoredDay);
      expect(queriedFrom.filter((day) => day < firstUnstoredDay)).toEqual([]);
      expect(mocks.upsert.mock.calls.map(([args]) => formatDayKey(args.where.day_platform.day)))
        .toEqual(cacheableDays.slice(storedDayCount));
      expect(metrics[0].points.map((point) => point.value)).toEqual(range.dayKeys.map(dayOfMonth));
    });
  });
});

describe("clearAdminDashboardCache", () => {
  it("deletes only the specified day keys", async () => {
    const dayKeys = ["2026-08-01", "2026-08-02", "2026-08-03"];
    mocks.deleteMany.mockResolvedValue({ count: 3 });
    await clearAdminDashboardCache(dayKeys);
    expect(mocks.deleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.deleteMany.mock.calls[0][0].where.day.in).toHaveLength(3);
    expect(mocks.deleteMany.mock.calls[0][0].where.platform).toBe("all");
  });

  it("deletes only the specified platform cache rows", async () => {
    const dayKeys = ["2026-08-01", "2026-08-02"];
    mocks.deleteMany.mockResolvedValue({ count: 2 });

    await clearAdminDashboardCache(dayKeys, "android");

    expect(mocks.deleteMany.mock.calls[0][0].where).toMatchObject({
      platform: "android",
      day: { in: [rawDay("2026-08-01"), rawDay("2026-08-02")] },
    });
  });

  it("does nothing when given an empty array", async () => {
    await clearAdminDashboardCache([]);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
});

describe("loadTranslationModelMessageSeries", () => {
  const dayKeys = ["2026-08-02", "2026-08-03", "2026-08-04"];

  it("counts live translated messages per day and case/space-folded model with the message-count filters", async () => {
    mocks.queryRawUnsafe.mockResolvedValueOnce([]);
    const range = makeRange(dayKeys);

    await loadTranslationModelMessageSeries(range);

    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(1);
    const [query, ...params] = mocks.queryRawUnsafe.mock.calls[0] as [string, ...unknown[]];
    expect(normalizeSql(query)).toBe(normalizeSql(`
      select date_trunc('day', m."created_at") as day, lower(btrim(m."translation_model")) as model, count(*) as value
      from "app"."app_messages" as m
      where m."is_deleted" is distinct from true
        and m."created_at" >= $1 and m."created_at" < $2
        and not exists (select 1 from "app"."app_users" as op where op."id" = m."user_id" and op."is_operator")
        and m."translation_model" is not null
      group by day, lower(btrim(m."translation_model"))
      order by day, model
    `));
    expect(params).toEqual([range.rangeStart, range.rangeEnd]);
    // Live by design: the daily metric cache is neither read nor written.
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it.each(["android", "ios"] as const)("joins app_users and binds %s as $3", async (platform) => {
    mocks.queryRawUnsafe.mockResolvedValueOnce([]);
    const range = makeRange(dayKeys);

    await loadTranslationModelMessageSeries(range, { platform });

    const [query, ...params] = mocks.queryRawUnsafe.mock.calls[0] as [string, ...unknown[]];
    expect(query).toContain('join "app"."app_users" as u on u."id" = m."user_id"');
    expect(query).toContain('and u."latest_client_platform" = $3');
    expect(query).toContain('m."translation_model" is not null');
    expect(params).toEqual([range.rangeStart, range.rangeEnd, platform]);
  });

  it.each(["all", "android", "ios"] as const)(
    "filters exactly like the message count plus the translated-only condition (%s)",
    async (platform) => {
      const today = resolveTodayKey(new Date());
      setRawMetricResults(today);
      await loadAdminDashboardMetrics(makeRange([today]), { platform });
      const messageCountQuery = normalizeSql(mocks.queryRawUnsafe.mock.calls[2][0] as string);
      mocks.queryRawUnsafe.mockResolvedValueOnce([]);

      await loadTranslationModelMessageSeries(makeRange([today]), { platform });

      const modelQuery = normalizeSql(mocks.queryRawUnsafe.mock.calls[8][0] as string);
      expect(sqlSource(modelQuery)).toBe(`${sqlSource(messageCountQuery)} and m."translation_model" is not null`);
    },
  );

  it("folds raw model strings into ordered canonical series with a trailing 기타", async () => {
    mocks.queryRawUnsafe.mockResolvedValueOnce([
      { day: rawDay("2026-08-02"), model: "gpt-6-luna", value: BigInt(2) },
      { day: rawDay("2026-08-02"), model: "openai/gpt-6-luna", value: BigInt(3) },
      { day: rawDay("2026-08-03"), model: "anthropic/claude-haiku-5-5", value: BigInt(4) },
      { day: rawDay("2026-08-03"), model: "gemini-2.5-flash-lite", value: 6 },
      { day: rawDay("2026-08-04"), model: "legacy-model", value: BigInt(5) },
    ]);

    const series = await loadTranslationModelMessageSeries(makeRange(dayKeys), { platform: "android" });

    expect(series.map((entry) => ({
      key: entry.key,
      label: entry.label,
      values: entry.points.map((point) => point.value),
      total: entry.total,
      share: entry.share,
    }))).toEqual([
      { key: "gemini-2.5-flash-lite", label: "gemini-2.5-flash-lite", values: [0, 6, 0], total: 6, share: 0.3 },
      { key: "gpt-6-luna", label: "gpt-6-luna", values: [5, 0, 0], total: 5, share: 0.25 },
      { key: "claude-haiku-5-5", label: "claude-haiku-5-5", values: [0, 4, 0], total: 4, share: 0.2 },
      { key: "other", label: "기타", values: [0, 0, 5], total: 5, share: 0.25 },
    ]);
  });
});
