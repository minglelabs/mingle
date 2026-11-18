import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryVoiceStore } from "@/server/voice/memory-voice-store";
import { getLiveCallView, joinVoiceCall, RECONCILE_GRACE_MS } from "@/server/voice/voice-calls";
import {
  LISTED_CALL_RECONCILE_INTERVAL_MS,
  reconcileListedLiveCalls,
  setListedCallReconcileDepsForTests,
} from "@/server/voice/reconcile-listed-calls";

const CONFIG = { url: "wss://voice.example", apiKey: "k", apiSecret: "s" };

async function storeWithDroppedPhone() {
  const store = createMemoryVoiceStore();
  await joinVoiceCall(store, { channelId: "chan-1", userId: "here", lang: "ko", interpretOn: false });
  await joinVoiceCall(store, { channelId: "chan-1", userId: "gone", lang: "ja", interpretOn: false });
  // Both joined long enough ago to be past the join grace.
  for (const row of store.participants) row.joinedAt = new Date(Date.now() - RECONCILE_GRACE_MS - 1000);
  return store;
}

afterEach(() => setListedCallReconcileDepsForTests(null));

describe("reconcileListedLiveCalls", () => {
  it("frees the seat of a phone LiveKit no longer has, so the list stops counting it", async () => {
    const store = await storeWithDroppedPhone();
    const listIdentities = vi.fn(async () => ["here"]);
    setListedCallReconcileDepsForTests({
      store,
      readConfig: () => CONFIG,
      listIdentities,
      findLiveCallChannelIds: async () => ["chan-1"],
    });
    const onCallChanged = vi.fn(async () => {})
    setListedCallReconcileDepsForTests({
      store,
      readConfig: () => CONFIG,
      listIdentities,
      findLiveCallChannelIds: async () => ["chan-1"],
      onCallChanged,
    });
    await reconcileListedLiveCalls(["chan-1", "chan-2"]);
    const view = await getLiveCallView(store, "chan-1");
    expect(view?.participants.map((p) => p.userId)).toEqual(["here"]);
    // The other members' lists are told to refresh.
    expect(onCallChanged).toHaveBeenCalledWith("chan-1");
  });

  it("asks LiveKit about a room at most once per interval", async () => {
    const store = await storeWithDroppedPhone();
    let now = 1_000_000;
    const listIdentities = vi.fn(async () => ["here", "gone"]);
    const onCallChanged = vi.fn(async () => {})
    setListedCallReconcileDepsForTests({
      store,
      readConfig: () => CONFIG,
      listIdentities,
      findLiveCallChannelIds: async () => ["chan-1"],
      onCallChanged,
      now: () => now,
    });
    await reconcileListedLiveCalls(["chan-1"]);
    await reconcileListedLiveCalls(["chan-1"]);
    expect(listIdentities).toHaveBeenCalledTimes(1);
    now += LISTED_CALL_RECONCILE_INTERVAL_MS;
    await reconcileListedLiveCalls(["chan-1"]);
    expect(listIdentities).toHaveBeenCalledTimes(2);
    // Nobody dropped: no list refresh is sent.
    expect(onCallChanged).not.toHaveBeenCalled();
  });

  it("does nothing without LiveKit settings or when LiveKit cannot be asked", async () => {
    const store = await storeWithDroppedPhone();
    const findLiveCallChannelIds = vi.fn(async () => ["chan-1"]);
    setListedCallReconcileDepsForTests({ store, readConfig: () => null, findLiveCallChannelIds });
    await reconcileListedLiveCalls(["chan-1"]);
    expect(findLiveCallChannelIds).not.toHaveBeenCalled();

    setListedCallReconcileDepsForTests({
      store,
      readConfig: () => CONFIG,
      listIdentities: async () => null,
      findLiveCallChannelIds,
    });
    await reconcileListedLiveCalls(["chan-1"]);
    expect((await getLiveCallView(store, "chan-1"))?.participants).toHaveLength(2);
  });
});
