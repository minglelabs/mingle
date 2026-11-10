import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetOperatorPostStatsClient, requestOperatorPostStats } from "./use-operator-post-stats";

const STATS = { views: 10, likes: 1, comments: 0, follows: 1, profileVisits: 2, messages: 0 };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("operator post stats client", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.useFakeTimers();
    __resetOperatorPostStatsClient();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("asks once for the cards mounted together and hands each its own stats", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { stats: { p1: STATS } }));
    const first = requestOperatorPostStats("staff", "p1");
    const second = requestOperatorPostStats("staff", "p2");
    await vi.advanceTimersByTimeAsync(60);
    await expect(first).resolves.toEqual(STATS);
    await expect(second).resolves.toBeNull(); // not an operator post: absent from the answer
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("/admin/api/post-stats?ids=p1,p2");
  });

  it("stops asking for an account the server refused", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(403, { error: "forbidden" }));
    const first = requestOperatorPostStats("user", "p1");
    await vi.advanceTimersByTimeAsync(60);
    await expect(first).resolves.toBeNull();
    await expect(requestOperatorPostStats("user", "p2")).resolves.toBeNull();
    await vi.advanceTimersByTimeAsync(60);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks again for another signed-in account", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: "forbidden" }));
    const refused = requestOperatorPostStats("user", "p1");
    await vi.advanceTimersByTimeAsync(60);
    await expect(refused).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { stats: { p1: STATS } }));
    const allowed = requestOperatorPostStats("staff", "p1");
    await vi.advanceTimersByTimeAsync(60);
    await expect(allowed).resolves.toEqual(STATS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reuses a fresh answer and asks again once it is stale", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { stats: { p1: STATS } }));
    const first = requestOperatorPostStats("staff", "p1");
    await vi.advanceTimersByTimeAsync(60);
    await first;
    await expect(requestOperatorPostStats("staff", "p1")).resolves.toEqual(STATS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(61_000);
    const again = requestOperatorPostStats("staff", "p1");
    await vi.advanceTimersByTimeAsync(60);
    await expect(again).resolves.toEqual(STATS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("splits a large batch at the endpoint's cap", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { stats: {} }));
    const all = Array.from({ length: 25 }, (_, index) => requestOperatorPostStats("staff", `p${index}`));
    await vi.advanceTimersByTimeAsync(200);
    await Promise.all(all);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0]).split("=")[1].split(",")).toHaveLength(20);
  });

  it("does not cache a failed request", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const failed = requestOperatorPostStats("staff", "p1");
    await vi.advanceTimersByTimeAsync(60);
    await expect(failed).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { stats: { p1: STATS } }));
    const retried = requestOperatorPostStats("staff", "p1");
    await vi.advanceTimersByTimeAsync(60);
    await expect(retried).resolves.toEqual(STATS);
  });
});
