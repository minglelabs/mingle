import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PULL_REFRESH_TRIGGER_PX, pullDistanceFor } from "@/lib/use-pull-to-refresh";

describe("pull to refresh", () => {
  it("opens with resistance, up to a limit, and only downwards", () => {
    expect(pullDistanceFor(-30)).toBe(0);
    expect(pullDistanceFor(0)).toBe(0);
    expect(pullDistanceFor(100)).toBe(45);
    expect(pullDistanceFor(100)).toBeLessThan(PULL_REFRESH_TRIGGER_PX);
    expect(pullDistanceFor(160)).toBeGreaterThanOrEqual(PULL_REFRESH_TRIGGER_PX);
    expect(pullDistanceFor(5000)).toBe(96);
  });

  it("is on the explore tab", () => {
    const page = readFileSync(join(process.cwd(), "src/components/explore/explore-people-page.tsx"), "utf8");
    expect(page).toContain("usePullToRefresh(scrollEl, refreshFromTop");
    expect(page).toContain('data-qa="explore-pull-refresh"');
  });
});
