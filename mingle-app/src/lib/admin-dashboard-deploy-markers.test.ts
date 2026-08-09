import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDeployMarkersFromCommits, withinRange, type GithubCommit } from "./admin-dashboard-deploy-markers";
import type { AdminDashboardDateRange } from "./admin-dashboard-metrics";

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

describe("loadDeployMarkers (GraphQL fetch + cache)", () => {
  const ORIGINAL_GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const WIDE_RANGE: AdminDashboardDateRange = {
    dayKeys: ["2026-01-01", "2026-12-31"],
    rangeStart: new Date(0),
    rangeEnd: new Date(0),
  };

  function graphqlNode(oid: string, message: string, committedDate: string) {
    return { oid, message, committedDate };
  }

  function graphqlResponse(pathResults: { nodes: ReturnType<typeof graphqlNode>[]; hasNextPage?: boolean }[]) {
    const target: Record<string, unknown> = {};
    pathResults.forEach((entry, i) => {
      target[`p${i}`] = { pageInfo: { hasNextPage: entry.hasNextPage ?? false }, nodes: entry.nodes };
    });
    return new Response(JSON.stringify({ data: { repository: { ref: { target } } } }), { status: 200 });
  }

  async function loadFreshModule() {
    vi.resetModules();
    return import("./admin-dashboard-deploy-markers");
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (ORIGINAL_GITHUB_TOKEN === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = ORIGINAL_GITHUB_TOKEN;
  });

  it("returns no markers and never calls fetch when GITHUB_TOKEN is unset", async () => {
    delete process.env.GITHUB_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { loadDeployMarkers } = await loadFreshModule();
    const markers = await loadDeployMarkers(WIDE_RANGE);

    expect(markers).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("collapses concurrent cache misses into a single GraphQL request", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(graphqlResponse([{ nodes: [graphqlNode("a1", "Ship STT fix", "2026-08-04T10:00:00Z")] }]));
    vi.stubGlobal("fetch", fetchMock);

    const { loadDeployMarkers } = await loadFreshModule();
    const [first, second] = await Promise.all([loadDeployMarkers(WIDE_RANGE), loadDeployMarkers(WIDE_RANGE)]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual([{ date: "2026-08-04", label: "Ship STT fix" }]);
    expect(second).toEqual(first);
  });

  it("sends one POST request with a bearer token and per-path GraphQL variables", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue(graphqlResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const { loadDeployMarkers } = await loadFreshModule();
    await loadDeployMarkers(WIDE_RANGE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.github.com/graphql");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    const body = JSON.parse(init.body);
    expect(body.variables.owner).toBe("minglelabs");
    expect(body.variables.name).toBe("mingle");
    expect(body.variables.path0).toBeTruthy();
  });

  it("keeps serving the last successful markers when a later refresh fails", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        graphqlResponse([{ nodes: [graphqlNode("a1", "Ship STT fix", "2026-08-04T10:00:00Z")] }]),
      )
      .mockResolvedValueOnce(new Response("boom", { status: 500, statusText: "Internal Server Error" }));
    vi.stubGlobal("fetch", fetchMock);

    const { loadDeployMarkers } = await loadFreshModule();
    const firstLoad = await loadDeployMarkers(WIDE_RANGE);
    expect(firstLoad).toEqual([{ date: "2026-08-04", label: "Ship STT fix" }]);

    vi.setSystemTime(new Date("2026-08-04T02:00:00Z")); // past the 1-hour cache TTL
    const secondLoad = await loadDeployMarkers(WIDE_RANGE);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(secondLoad).toEqual(firstLoad);
  });

  it("treats a GraphQL errors[] response the same as a failed request", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: "Bad credentials" }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { loadDeployMarkers } = await loadFreshModule();
    const markers = await loadDeployMarkers(WIDE_RANGE);

    expect(markers).toEqual([]);
  });

  it("warns when a watched path's commit history is truncated at the page size", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        graphqlResponse([{ nodes: [graphqlNode("a1", "Ship STT fix", "2026-08-04T10:00:00Z")], hasNextPage: true }]),
      );
    vi.stubGlobal("fetch", fetchMock);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { loadDeployMarkers } = await loadFreshModule();
    await loadDeployMarkers(WIDE_RANGE);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("more than 100 commits"));
    warnSpy.mockRestore();
  });
});
