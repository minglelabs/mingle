import { describe, expect, it } from "vitest";
import { buildDeployMarkersFromCommits, withinRange, type GithubCommit } from "./admin-dashboard-deploy-markers";

function commit(sha: string, message: string, date: string | null): GithubCommit {
  return { sha, commit: { message, author: date ? { date } : null } };
}

describe("buildDeployMarkersFromCommits", () => {
  it("takes the first line of the commit message as the label", () => {
    const markers = buildDeployMarkersFromCommits([
      [commit("a1", "Use Soniox RT V5 without translation\n\nLonger body text here.", "2026-08-04T10:00:00Z")],
    ]);
    expect(markers).toEqual([{ date: "2026-08-04", label: "Use Soniox RT V5 without translation" }]);
  });

  it("merges commits found under different watched paths, deduping by day", () => {
    const markers = buildDeployMarkersFromCommits([
      [commit("a1", "STT server tweak", "2026-08-02T09:00:00Z")],
      [commit("b1", "Railway region change", "2026-08-02T15:00:00Z")], // same day as a1 -- a1 wins (first path wins)
      [commit("c1", "Translation timeout bump", "2026-08-04T09:00:00Z")],
    ]);
    expect(markers).toEqual([
      { date: "2026-08-02", label: "STT server tweak" },
      { date: "2026-08-04", label: "Translation timeout bump" },
    ]);
  });

  it("sorts markers ascending by date regardless of input order", () => {
    const markers = buildDeployMarkersFromCommits([
      [commit("a1", "later", "2026-08-05T00:00:00Z")],
      [commit("b1", "earlier", "2026-08-01T00:00:00Z")],
    ]);
    expect(markers.map((marker) => marker.date)).toEqual(["2026-08-01", "2026-08-05"]);
  });

  it("skips commits with no author date", () => {
    const markers = buildDeployMarkersFromCommits([[commit("a1", "no date", null)]]);
    expect(markers).toEqual([]);
  });

  it("returns an empty list for no commits", () => {
    expect(buildDeployMarkersFromCommits([])).toEqual([]);
    expect(buildDeployMarkersFromCommits([[], []])).toEqual([]);
  });

  it("prefers a descriptive commit over a generic merge message on the same day", () => {
    const markers = buildDeployMarkersFromCommits([
      [
        // newest first, matching GitHub's own ordering -- the generic merge commit
        // would otherwise win by being first if messages weren't ranked.
        commit("a1", "Merge remote-tracking branch 'origin/main' into codex/investigate-startup-slowness", "2026-05-25T13:49:12Z"),
        commit("a2", "Guard native STT stop ready messages", "2026-05-25T13:13:48Z"),
      ],
    ]);
    expect(markers).toEqual([{ date: "2026-05-25", label: "Guard native STT stop ready messages" }]);
  });

  it("still falls back to a generic merge message when nothing better exists that day", () => {
    const markers = buildDeployMarkersFromCommits([
      [commit("a1", "Merge pull request #192 from minglelabs/codex/soniox-rt-v5-model-test", "2026-08-03T15:00:00Z")],
    ]);
    expect(markers).toEqual([{ date: "2026-08-03", label: "Merge pull request #192 from minglelabs/codex/soniox-rt-v5-model-test" }]);
  });
});

describe("withinRange", () => {
  const range = { dayKeys: ["2026-08-02", "2026-08-03", "2026-08-04"], rangeStart: new Date(0), rangeEnd: new Date(0) };

  it("includes the first and last day inclusive", () => {
    expect(withinRange("2026-08-02", range)).toBe(true);
    expect(withinRange("2026-08-04", range)).toBe(true);
  });

  it("excludes dates outside the range on either side", () => {
    expect(withinRange("2026-08-01", range)).toBe(false);
    expect(withinRange("2026-08-05", range)).toBe(false);
  });
});
