import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminDashboardDateRange } from "./admin-dashboard-metrics";
import { parseDayKey, resolveTodayKey, shiftDayKey, startOfDayUtc } from "./admin-dashboard-metrics";

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

import { clearAdminDashboardCache, loadAdminDashboardMetrics } from "./admin-dashboard-query";

function makeRange(dayKeys: string[]): AdminDashboardDateRange {
  const rangeStart = startOfDayUtc(dayKeys[0]);
  const rangeEnd = startOfDayUtc(dayKeys[dayKeys.length - 1]);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
  return { dayKeys, rangeStart, rangeEnd };
}

function rawDay(dayKey: string): Date {
  return parseDayKey(dayKey);
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
  it("uses cached daily rows without querying source tables for historical days", async () => {
    const dayKeys = ["2026-08-02", "2026-08-03", "2026-08-04"];
    mocks.findMany.mockResolvedValue(dayKeys.map((day, index) => ({
      day: rawDay(day),
      signupCount: index + 1,
      dauCount: index + 2,
      messageCount: index + 3,
      usageSeconds: index + 4,
      usageMetricVersion: 1,
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
      usageMetricVersion: 1,
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
      usageMetricVersion: 0,
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
      usageMetricVersion: 1,
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
      usageMetricVersion: 1,
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

  it("calculates a platform-filtered view from source rows without using the all-platform cache", async () => {
    const dayKey = "2026-08-02";
    setRawMetricResults(dayKey);

    const metrics = await loadAdminDashboardMetrics(makeRange([dayKey]), { platform: "android" });

    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
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
    expect(mocks.upsert.mock.calls.map(([args]) => args.where.day)).toEqual([
      rawDay("2026-08-02"),
      rawDay("2026-08-03"),
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
  });

  it("does nothing when given an empty array", async () => {
    await clearAdminDashboardCache([]);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
});
