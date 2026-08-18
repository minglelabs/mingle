import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminDashboardDateRange } from "./admin-dashboard-metrics";
import { parseDayKey, resolveTodayKey, shiftDayKey, startOfDayUtc } from "./admin-dashboard-metrics";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  createMany: vi.fn(),
  deleteMany: vi.fn(),
  upsert: vi.fn(),
  queryRawUnsafe: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminDashboardDailyMetric: {
      findMany: mocks.findMany,
      createMany: mocks.createMany,
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
      sttAvgMs: index + 5,
      sttP95Ms: index + 6,
      translationAvgMs: index + 7,
      translationP95Ms: index + 8,
    })));

    const metrics = await loadAdminDashboardMetrics(makeRange(dayKeys));

    expect(mocks.queryRawUnsafe).not.toHaveBeenCalled();
    expect(mocks.createMany).not.toHaveBeenCalled();
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
    mocks.createMany.mockResolvedValue({ count: dayKeys.length });

    const metrics = await loadAdminDashboardMetrics(makeRange(dayKeys));

    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(6);
    expect(mocks.createMany).toHaveBeenCalledTimes(1);
    expect(mocks.createMany.mock.calls[0][0].data).toHaveLength(3);
    expect(mocks.createMany.mock.calls[0][0].data[0]).toMatchObject({
      day: rawDay("2026-08-02"),
      signupCount: 0,
      dauCount: 0,
      messageCount: 0,
      usageSeconds: 0,
      sttAvgMs: null,
      translationAvgMs: null,
    });
    expect(metrics[0].points.map((point) => point.value)).toEqual([0, 5, 0]);
    expect(metrics[1].points.map((point) => point.value)).toEqual([0, 4, 0]);
    expect(metrics[4].points.map((point) => point.value)).toEqual([null, 100, null]);
    expect(metrics[4].secondarySeries?.points.map((point) => point.value)).toEqual([null, 180, null]);
  });

  it("queries today and yesterday on the fly without saving them to DB cache", async () => {
    const today = resolveTodayKey(new Date());
    const yesterday = shiftDayKey(today, -1);
    mocks.findMany.mockResolvedValue([]);
    // Two uncacheable days → queryDailyMetricSnapshots called once (they're batched)
    setRawMetricResults(today);

    const metrics = await loadAdminDashboardMetrics(makeRange([yesterday, today]));

    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(6);
    // Neither today nor yesterday triggers a findMany call
    expect(mocks.findMany).not.toHaveBeenCalled();
    // Neither today nor yesterday is persisted into cache
    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("queries only today when yesterday is cached", async () => {
    const today = resolveTodayKey(new Date());
    const yesterday = shiftDayKey(today, -1);
    const twoDaysAgo = shiftDayKey(today, -2);
    const dayKeys = [twoDaysAgo, yesterday, today];

    // twoDaysAgo is in cache, yesterday is uncacheable (not in DB), today is uncacheable
    mocks.findMany.mockResolvedValue([{
      day: rawDay(twoDaysAgo),
      signupCount: 9,
      dauCount: 8,
      messageCount: 7,
      usageSeconds: 6,
      sttAvgMs: null,
      sttP95Ms: null,
      translationAvgMs: null,
      translationP95Ms: null,
    }]);
    setRawMetricResults(today);

    const metrics = await loadAdminDashboardMetrics(makeRange(dayKeys));

    // findMany called for twoDaysAgo (cacheable)
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    // DB query runs for yesterday+today (uncacheable) only
    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(6);
    // Only twoDaysAgo's cached data is written (already there, skipped by skipDuplicates)
    // yesterday and today are NOT persisted
    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(metrics[0].points[0].value).toBe(6); // twoDaysAgo usageSeconds from cache
  });

  it("forceRefresh deletes only cacheable days and recalculates everything, persisting only cacheable days", async () => {
    const today = resolveTodayKey(new Date());
    const yesterday = shiftDayKey(today, -1);
    const dayKeys = ["2026-08-02", "2026-08-03", yesterday, today];
    setRawMetricResults("2026-08-02");
    mocks.deleteMany.mockResolvedValue({ count: 2 });
    mocks.createMany.mockResolvedValue({ count: 2 });

    const metrics = await loadAdminDashboardMetrics(makeRange(dayKeys), { forceRefresh: true });

    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(6);
    expect(mocks.deleteMany).toHaveBeenCalledTimes(1);
    // deleteMany was called only for the 2 cacheable historical days, not today/yesterday
    const deletedDays: Date[] = mocks.deleteMany.mock.calls[0][0].where.day.in;
    expect(deletedDays).toHaveLength(2);
    expect(mocks.createMany).toHaveBeenCalledTimes(1);
    // Only the 2 cacheable historical days are persisted, not today/yesterday
    expect(mocks.createMany.mock.calls[0][0].data).toHaveLength(2);
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
