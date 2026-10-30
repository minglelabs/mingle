import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { buildSignupRetention, weekStartKey } from "./admin-dashboard-retention";
import { RetentionCohortTable } from "@/app/admin/dashboard/retention-section";

const TODAY = "2026-10-30"; // a Friday

describe("signup retention", () => {
  it("weeks start on Monday", () => {
    expect(weekStartKey("2026-10-30")).toBe("2026-10-26");
    expect(weekStartKey("2026-10-26")).toBe("2026-10-26");
    expect(weekStartKey("2026-10-25")).toBe("2026-10-19");
  });

  it("runs the cumulative total from every signup before the range", () => {
    const rows = [
      { day: "2026-09-01", offsets: [] },
      { day: "2026-10-28", offsets: [] },
      { day: "2026-10-30", offsets: [] },
      { day: "2026-10-30", offsets: [] },
    ];
    const result = buildSignupRetention(rows, ["2026-10-28", "2026-10-29", "2026-10-30"], TODAY);
    expect(result.totalSignups).toBe(4);
    expect(result.rangeSignups).toBe(3);
    expect(result.cumulativePoints.map((point) => point.value)).toEqual([2, 2, 4]);
  });

  it("counts a user toward Dn only once day N has passed", () => {
    const rows = [
      { day: "2026-10-28", offsets: [1] }, // D1 is 10-29: passed, retained
      { day: "2026-10-29", offsets: [1] }, // D1 is today: not yet counted
      { day: "2026-10-20", offsets: [7] }, // D7 is 10-27: passed
      { day: "2026-10-22", offsets: [] }, // D1 passed, not retained; D7 is 10-29: passed
    ];
    const { overall, cohorts } = buildSignupRetention(rows, [TODAY], TODAY);
    expect(overall[1]).toEqual({ retained: 1, eligible: 3 });
    expect(overall[7]).toEqual({ retained: 1, eligible: 2 });
    expect(overall[30]).toEqual({ retained: 0, eligible: 0 });
    expect(cohorts.map((cohort) => [cohort.weekStart, cohort.signups])).toEqual([["2026-10-26", 2], ["2026-10-19", 2]]);
  });

  it("keeps only the recent weekly cohorts", () => {
    const { cohorts, overall } = buildSignupRetention([{ day: "2026-01-05", offsets: [30] }], [TODAY], TODAY);
    expect(cohorts).toEqual([]);
    expect(overall[30]).toEqual({ retained: 1, eligible: 1 });
  });

  it("shows a dash for a day that has not come yet", () => {
    const dashboard = buildSignupRetention([{ day: "2026-10-28", offsets: [1] }], [TODAY], TODAY);
    const html = renderToString(createElement(RetentionCohortTable, { dashboard }));
    expect(html).toContain("10/26 주");
    expect(html).toContain("100.0%<span class=\"ml-1 text-xs text-slate-400\">1/1</span>");
    expect(html.match(/>-</g)).toHaveLength(2);
  });
});
