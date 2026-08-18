import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminDashboardDateRange } from "./admin-dashboard-metrics";
import { parseDayKey, resolveTodayKey, startOfDayUtc } from "./admin-dashboard-metrics";

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

  it("queries the current day on the fly without saving it to DB cache", async () => {
    const today = resolveTodayKey(new Date());
    // Historical findMany should not be called with today
    mocks.findMany.mockResolvedValue([]);
    setRawMetricResults(today);

    const metrics = await loadAdminDashboardMetrics(makeRange([today]));

    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(6);
    expect(mocks.findMany).not.toHaveBeenCalled();
    // Today is NOT persisted into cache
    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(metrics[0].points[0].value).toBe(5);
    expect(metrics[4].points[0].value).toBe(100);
  });

  it("forceRefresh deletes existing cache and recalculates everything, persisting only historical days", async () => {
    const today = resolveTodayKey(new Date());
    const dayKeys = ["2026-08-02", "2026-08-03", today];
    setRawMetricResults("2026-08-02");
    mocks.deleteMany.mockResolvedValue({ count: 3 });
    mocks.createMany.mockResolvedValue({ count: 2 });

    const metrics = await loadAdminDashboardMetrics(makeRange(dayKeys), { forceRefresh: true });

    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(6);
    expect(mocks.deleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.createMany).toHaveBeenCalledTimes(1);
    // Only the 2 historical days are persisted, not today
    expect(mocks.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(metrics[0].points).toHaveLength(3);
  });
});

describe("clearAdminDashboardCache", () => {
  it("deletes all cached metric records", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 10 });
    await clearAdminDashboardCache();
    expect(mocks.deleteMany).toHaveBeenCalledWith();
  });
});

