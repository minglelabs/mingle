import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminDashboardDateRange } from "./admin-dashboard-metrics";
import { parseDayKey, resolveAdminDashboardRange, resolveTodayKey, shiftDayKey, startOfDayUtc } from "./admin-dashboard-metrics";

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
    .mockResolvedValueOnce([{ day: rawDay(dayKey), avg_ms: 220, p95_ms: 360 }]);
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
      for (const index of [1, 2, 4, 5]) {
        expect(queries[index]).toContain('from "app"."app_messages" as m');
        expect(queries[index]).toContain(operatorSender);
      }
      // Messages without a sender stay in the count: NOT EXISTS, never NOT IN.
      expect(queries.join("\n")).not.toMatch(/not in \(/i);
      // Usage comes from client event logs, which operators never write.
      expect(queries[3]).not.toContain("is_operator");
    },
  );

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
        usageMetricVersion: 2,
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
      expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(6);
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
      usageMetricVersion: 2,
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
        usageSeconds: 6, usageMetricVersion: 2, sttAvgMs: null, sttP95Ms: null,
        translationAvgMs: null, translationP95Ms: null,
      })));
    setRawMetricResults(missingDay);
    setRawMetricResults(range.dayKeys[29]);

    const metrics = await loadAdminDashboardMetrics(range, { platform: "android" });

    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(12);
    for (const [, start, end] of mocks.queryRawUnsafe.mock.calls.slice(0, 6)) {
      expect(start).toEqual(startOfDayUtc(missingDay));
      expect(end).toEqual(startOfDayUtc(shiftDayKey(missingDay, 1)));
    }
    for (const [, start, end] of mocks.queryRawUnsafe.mock.calls.slice(6)) {
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

    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(6);
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
      usageMetricVersion: 2,
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

    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(6);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0].update).toMatchObject({
      usageSeconds: 5,
      usageMetricVersion: 2,
    });
    expect(metrics[0].points[0].value).toBe(5);
  });

  it("queries today and yesterday on the fly without saving them to DB cache", async () => {
    const today = resolveTodayKey(new Date());
    const yesterday = shiftDayKey(today, -1);
    setRawMetricResults(today);

    await loadAdminDashboardMetrics(makeRange([yesterday, today]));

    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(6);
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
      usageMetricVersion: 2,
      sttAvgMs: null,
      sttP95Ms: null,
      translationAvgMs: null,
      translationP95Ms: null,
    }]);
    setRawMetricResults(today);

    const metrics = await loadAdminDashboardMetrics(makeRange(dayKeys));

    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(6);
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
    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(6);
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
      usageMetricVersion: 2,
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
    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(6);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(metrics[0].points.map((point) => point.value)).toEqual([6, 5, 0]);
  });

  it("forceRefresh deletes only cacheable days and recalculates everything, persisting only cacheable days", async () => {
    const today = resolveTodayKey(new Date());
    const yesterday = shiftDayKey(today, -1);
    const dayKeys = ["2026-08-02", "2026-08-03", yesterday, today];
    setRawMetricResults("2026-08-02");
    mocks.deleteMany.mockResolvedValue({ count: 2 });
    mocks.upsert.mockResolvedValue({});

    const metrics = await loadAdminDashboardMetrics(makeRange(dayKeys), { forceRefresh: true });

    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(6);
    expect(mocks.deleteMany).toHaveBeenCalledTimes(1);
    const deletedDays: Date[] = mocks.deleteMany.mock.calls[0][0].where.day.in;
    expect(deletedDays).toHaveLength(2);
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.deleteMany.mock.calls[0][0].where.platform).toBe("all");
    expect(mocks.upsert.mock.calls.map(([args]) => args.where.day_platform)).toEqual([
      { day: rawDay("2026-08-02"), platform: "all" },
      { day: rawDay("2026-08-03"), platform: "all" },
    ]);
    expect(metrics[0].points).toHaveLength(4);
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

      const modelQuery = normalizeSql(mocks.queryRawUnsafe.mock.calls[6][0] as string);
      expect(sqlSource(modelQuery)).toBe(`${sqlSource(messageCountQuery)} and m."translation_model" is not null`);
    },
  );

  it("folds raw model strings into ordered canonical series with a trailing 기타", async () => {
    mocks.queryRawUnsafe.mockResolvedValueOnce([
      { day: rawDay("2026-08-02"), model: "gpt-6-luna", value: BigInt(2) },
      { day: rawDay("2026-08-02"), model: "openai/gpt-6-luna", value: BigInt(3) },
      { day: rawDay("2026-08-03"), model: "qwen/qwen3.5-9b:free", value: BigInt(4) },
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
      { key: "qwen/qwen3.5-9b", label: "qwen3.5-9b", values: [0, 4, 0], total: 4, share: 0.2 },
      { key: "gpt-6-luna", label: "gpt-6-luna", values: [5, 0, 0], total: 5, share: 0.25 },
      { key: "other", label: "기타", values: [0, 0, 5], total: 5, share: 0.25 },
    ]);
  });
});
