import { describe, expect, it } from "vitest";
import {
  averageSeries,
  buildChartGeometry,
  computeDeltaPercent,
  enumerateDayKeys,
  fillDailySeries,
  formatCompactNumber,
  formatDayKey,
  formatDeltaPercent,
  formatMetricValue,
  formatSecondsAsDuration,
  niceCeil,
  normalizeDashboardDays,
  resolveDeltaTone,
  resolveDeployMarkerX,
  resolveTodayKey,
  shiftDayKey,
  startOfDayUtc,
  sumSeries,
} from "./admin-dashboard-metrics";

describe("resolveDeployMarkerX", () => {
  const dayKeys = ["2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05"];

  it("maps a marker date inside the range to its day's x position", () => {
    expect(resolveDeployMarkerX(dayKeys, "2026-08-02", 300)).toBe(0);
    expect(resolveDeployMarkerX(dayKeys, "2026-08-05", 300)).toBe(300);
    expect(resolveDeployMarkerX(dayKeys, "2026-08-03", 300)).toBeCloseTo(100);
  });

  it("returns null for a marker date outside the visible range", () => {
    expect(resolveDeployMarkerX(dayKeys, "2026-07-20", 300)).toBeNull();
  });
});

describe("range + timezone", () => {
  it("accepts only the offered ranges and falls back to 30", () => {
    expect(normalizeDashboardDays("7")).toBe(7);
    expect(normalizeDashboardDays(90)).toBe(90);
    expect(normalizeDashboardDays("14")).toBe(30);
    expect(normalizeDashboardDays(undefined)).toBe(30);
    expect(normalizeDashboardDays("drop table")).toBe(30);
  });

  it("resolves the UTC day, matching how created_at is stored", () => {
    expect(resolveTodayKey(new Date("2026-08-04T22:30:00Z"))).toBe("2026-08-04");
    expect(resolveTodayKey(new Date("2026-08-05T00:30:00Z"))).toBe("2026-08-05");
  });

  it("maps a day key back to UTC midnight with no offset", () => {
    expect(startOfDayUtc("2026-08-04").toISOString()).toBe("2026-08-04T00:00:00.000Z");
  });
});

describe("day keys", () => {
  it("formats a date using UTC fields", () => {
    expect(formatDayKey(new Date(Date.UTC(2026, 7, 4)))).toBe("2026-08-04");
  });

  it("shifts across a month boundary", () => {
    expect(shiftDayKey("2026-08-01", -1)).toBe("2026-07-31");
    expect(shiftDayKey("2026-07-31", 1)).toBe("2026-08-01");
  });

  it("enumerates ascending keys ending at the requested day", () => {
    expect(enumerateDayKeys("2026-08-04", 3)).toEqual([
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
    ]);
  });

  it("always returns at least one key", () => {
    expect(enumerateDayKeys("2026-08-04", 0)).toEqual(["2026-08-04"]);
  });
});

describe("fillDailySeries", () => {
  const dayKeys = ["2026-08-02", "2026-08-03", "2026-08-04"];

  it("fills missing count days with zero", () => {
    const filled = fillDailySeries([{ day: "2026-08-03", value: 7 }], dayKeys, 0);
    expect(filled).toEqual([
      { day: "2026-08-02", value: 0 },
      { day: "2026-08-03", value: 7 },
      { day: "2026-08-04", value: 0 },
    ]);
  });

  it("keeps missing latency days null instead of pretending they were zero", () => {
    const filled = fillDailySeries([{ day: "2026-08-04", value: 320 }], dayKeys, null);
    expect(filled).toEqual([
      { day: "2026-08-02", value: null },
      { day: "2026-08-03", value: null },
      { day: "2026-08-04", value: 320 },
    ]);
  });
});

describe("formatting", () => {
  it("keeps values under 10k comma separated", () => {
    expect(formatCompactNumber(1284)).toBe("1,284");
  });

  it("compacts thousands and millions", () => {
    expect(formatCompactNumber(12_900)).toBe("12.9K");
    expect(formatCompactNumber(4_200_000)).toBe("4.2M");
  });

  it("renders milliseconds with a unit", () => {
    expect(formatMetricValue(1234.6, "milliseconds")).toBe("1,235ms");
  });

  it("renders an em dash when a metric has no value", () => {
    expect(formatMetricValue(null, "count")).toBe("—");
  });

  it("formats seconds as a readable duration", () => {
    expect(formatSecondsAsDuration(45)).toBe("45초");
    expect(formatSecondsAsDuration(600)).toBe("10분");
    expect(formatSecondsAsDuration(3_600)).toBe("1시간");
    expect(formatSecondsAsDuration(5_400)).toBe("1시간 30분");
    expect(formatSecondsAsDuration(90_000)).toBe("1일 1시간");
  });
});

describe("delta", () => {
  it("computes a percentage change", () => {
    expect(computeDeltaPercent(150, 100)).toBeCloseTo(50);
    expect(computeDeltaPercent(50, 100)).toBeCloseTo(-50);
  });

  it("returns null when the baseline is zero or missing", () => {
    expect(computeDeltaPercent(10, 0)).toBeNull();
    expect(computeDeltaPercent(10, null)).toBeNull();
    expect(computeDeltaPercent(null, 10)).toBeNull();
  });

  it("formats with an explicit sign", () => {
    expect(formatDeltaPercent(12.34)).toBe("+12.3%");
    expect(formatDeltaPercent(-8)).toBe("-8.0%");
    expect(formatDeltaPercent(null)).toBe("—");
  });

  it("treats rising latency as bad but rising signups as good", () => {
    expect(resolveDeltaTone(20, false)).toBe("good");
    expect(resolveDeltaTone(20, true)).toBe("bad");
    expect(resolveDeltaTone(-20, true)).toBe("good");
    expect(resolveDeltaTone(null, false)).toBe("neutral");
    expect(resolveDeltaTone(0, false)).toBe("neutral");
  });
});

describe("niceCeil", () => {
  it("rounds up to 1/2/5 x 10^n", () => {
    expect(niceCeil(7)).toBe(10);
    expect(niceCeil(12)).toBe(20);
    expect(niceCeil(23)).toBe(50);
    expect(niceCeil(140)).toBe(200);
  });

  it("never returns zero", () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(-5)).toBe(1);
  });
});

describe("buildChartGeometry", () => {
  it("projects points across the full width with a zero baseline", () => {
    const geometry = buildChartGeometry(
      [
        { day: "2026-08-02", value: 0 },
        { day: "2026-08-03", value: 5 },
        { day: "2026-08-04", value: 10 },
      ],
      100,
      50,
    );

    expect(geometry.yMax).toBe(10);
    expect(geometry.points[0]).toMatchObject({ x: 0, y: 50 });
    expect(geometry.points[2]).toMatchObject({ x: 100, y: 0 });
  });

  it("breaks the line into separate runs across a null gap", () => {
    const geometry = buildChartGeometry(
      [
        { day: "2026-08-01", value: 4 },
        { day: "2026-08-02", value: null },
        { day: "2026-08-03", value: 8 },
        { day: "2026-08-04", value: 6 },
      ],
      120,
      40,
    );

    expect(geometry.linePath.match(/M/g)).toHaveLength(2);
  });

  it("skips the area fill for a lone point so a single day is not drawn as a slab", () => {
    const geometry = buildChartGeometry(
      [
        { day: "2026-08-03", value: null },
        { day: "2026-08-04", value: 9 },
      ],
      80,
      40,
    );

    expect(geometry.areaPath).toBe("");
  });

  it("uses a shared yMax when given an override, so two series scale together", () => {
    const geometry = buildChartGeometry(
      [{ day: "2026-08-03", value: 5 }, { day: "2026-08-04", value: 10 }],
      100,
      50,
      100,
    );
    expect(geometry.yMax).toBe(100);
    // value 10 against yMax 100 should sit near the baseline, not near the top.
    expect(geometry.points[1].y).toBeCloseTo(45);
  });

  it("handles an all-null series without producing NaN coordinates", () => {
    const geometry = buildChartGeometry(
      [
        { day: "2026-08-03", value: null },
        { day: "2026-08-04", value: null },
      ],
      80,
      40,
    );

    expect(geometry.linePath).toBe("");
    expect(geometry.areaPath).toBe("");
    expect(geometry.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
  });
});

describe("aggregates", () => {
  const points = [
    { day: "2026-08-02", value: 10 },
    { day: "2026-08-03", value: null },
    { day: "2026-08-04", value: 20 },
  ];

  it("sums while treating gaps as zero", () => {
    expect(sumSeries(points)).toBe(30);
  });

  it("averages only the days that actually have data", () => {
    expect(averageSeries(points)).toBe(15);
  });

  it("returns null when averaging an empty series", () => {
    expect(averageSeries([{ day: "2026-08-04", value: null }])).toBeNull();
  });
});
