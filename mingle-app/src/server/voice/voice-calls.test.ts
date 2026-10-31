import { describe, expect, it } from "vitest";
import { createMemoryVoiceStore } from "@/server/voice/memory-voice-store";
import {
  applyLiveKitWebhookEvent,
  getLiveCallView,
  joinVoiceCall,
  leaveVoiceCall,
  reconcileLiveCall,
  RECONCILE_GRACE_MS,
  VoiceRoomFullError,
} from "@/server/voice/voice-calls";

const CHANNEL = "chan-1";

async function joinMany(store: ReturnType<typeof createMemoryVoiceStore>, count: number) {
  for (let index = 1; index <= count; index += 1) {
    await joinVoiceCall(store, { channelId: CHANNEL, userId: `user-${index}`, lang: "ko", interpretOn: true });
  }
}

describe("voice calls", () => {
  it("starts one live call per channel and reuses it for later joiners", async () => {
    const store = createMemoryVoiceStore();
    const first = await joinVoiceCall(store, { channelId: CHANNEL, userId: "user-1", lang: "ko", interpretOn: true });
    const second = await joinVoiceCall(store, { channelId: CHANNEL, userId: "user-2", lang: "ja", interpretOn: false });

    expect(second.id).toBe(first.id);
    expect(second.room).toMatch(/^voice-chan-1-/);
    expect(second.participants.map((p) => p.userId)).toEqual(["user-1", "user-2"]);
    expect(second.participants[1]).toMatchObject({ speechLanguage: "ja", interpretOn: false });
    expect(store.calls).toHaveLength(1);
  });

  it("rejects the 9th person but lets an existing participant rejoin", async () => {
    const store = createMemoryVoiceStore();
    await joinMany(store, 8);

    await expect(
      joinVoiceCall(store, { channelId: CHANNEL, userId: "user-9", lang: "ko", interpretOn: true }),
    ).rejects.toBeInstanceOf(VoiceRoomFullError);

    const rejoined = await joinVoiceCall(store, { channelId: CHANNEL, userId: "user-3", lang: "en", interpretOn: true });
    expect(rejoined.participants).toHaveLength(8);
  });

  it("frees a seat when someone leaves", async () => {
    const store = createMemoryVoiceStore();
    await joinMany(store, 8);
    await leaveVoiceCall(store, { channelId: CHANNEL, userId: "user-1" });
    const view = await joinVoiceCall(store, { channelId: CHANNEL, userId: "user-9", lang: "ko", interpretOn: true });
    expect(view.participants).toHaveLength(8);
  });

  it("ends the call and records one end event when the last person leaves", async () => {
    const store = createMemoryVoiceStore();
    await joinMany(store, 2);
    expect(await leaveVoiceCall(store, { channelId: CHANNEL, userId: "user-1" })).toEqual({ ended: false });
    const done = await leaveVoiceCall(store, {
      channelId: CHANNEL,
      userId: "user-2",
      now: new Date(Date.UTC(2026, 9, 31, 12, 12, 34)),
    });

    expect(done).toEqual({ ended: true });
    expect(await getLiveCallView(store, CHANNEL)).toBeNull();
    expect(store.endedEvents).toEqual([
      { channelId: CHANNEL, callId: "call-1", durationSec: 754, participantCount: 2 },
    ]);
  });

  it("starts a fresh room after a call has ended", async () => {
    const store = createMemoryVoiceStore();
    const first = await joinVoiceCall(store, { channelId: CHANNEL, userId: "user-1", lang: "ko", interpretOn: true });
    await leaveVoiceCall(store, { channelId: CHANNEL, userId: "user-1" });
    const second = await joinVoiceCall(store, { channelId: CHANNEL, userId: "user-1", lang: "ko", interpretOn: true });
    expect(second.id).not.toBe(first.id);
  });
});

describe("reconcileLiveCall", () => {
  const later = () => new Date(Date.now() + RECONCILE_GRACE_MS + 1000);

  it("frees seats of people LiveKit no longer has, so a full room opens up", async () => {
    const store = createMemoryVoiceStore();
    await joinMany(store, 8);
    const result = await reconcileLiveCall(store, {
      channelId: CHANNEL,
      listIdentities: async () => ["user-1", "user-2"],
      now: later(),
    });
    expect(result.dropped).toHaveLength(6);
    expect(result.ended).toBe(false);
    const view = await joinVoiceCall(store, { channelId: CHANNEL, userId: "user-9", lang: "ko", interpretOn: true });
    expect(view.participants.map((p) => p.userId)).toEqual(["user-1", "user-2", "user-9"]);
  });

  it("ends the call when LiveKit has nobody, and does nothing when LiveKit cannot be asked", async () => {
    const store = createMemoryVoiceStore();
    await joinMany(store, 2);
    expect(await reconcileLiveCall(store, { channelId: CHANNEL, listIdentities: async () => null, now: later() }))
      .toEqual({ dropped: [], ended: false });
    const result = await reconcileLiveCall(store, { channelId: CHANNEL, listIdentities: async () => [], now: later() });
    expect(result).toEqual({ dropped: ["user-1", "user-2"], ended: true });
    expect(store.endedEvents).toHaveLength(1);
  });

  it("keeps people who only just joined", async () => {
    const store = createMemoryVoiceStore();
    await joinMany(store, 1);
    const result = await reconcileLiveCall(store, { channelId: CHANNEL, listIdentities: async () => [] });
    expect(result).toEqual({ dropped: [], ended: false });
  });
});

describe("LiveKit webhook events", () => {
  it("tracks humans, ignores the interpreter, and ends the call once", async () => {
    const store = createMemoryVoiceStore();
    const call = await joinVoiceCall(store, { channelId: CHANNEL, userId: "user-1", lang: "ko", interpretOn: true });
    const room = { name: call.room };

    await applyLiveKitWebhookEvent(store, {
      event: "participant_joined",
      room,
      participant: { identity: "user-2", attributes: { lang: "ja", interpret: "off" } },
    });
    await applyLiveKitWebhookEvent(store, {
      event: "participant_joined",
      room,
      participant: { identity: `interpreter-${call.room}` },
    });
    const view = await getLiveCallView(store, CHANNEL);
    expect(view?.participants.map((p) => p.userId)).toEqual(["user-1", "user-2"]);
    expect(view?.participants[1]).toMatchObject({ speechLanguage: "ja", interpretOn: false });

    const first = await applyLiveKitWebhookEvent(store, { event: "room_finished", room });
    const again = await applyLiveKitWebhookEvent(store, { event: "room_finished", room });
    expect(first).toEqual({ handled: true, ended: true });
    expect(again).toEqual({ handled: true, ended: false });
    expect(store.endedEvents).toHaveLength(1);
  });

  it("ignores rooms that are not voice rooms or unknown", async () => {
    const store = createMemoryVoiceStore();
    expect(await applyLiveKitWebhookEvent(store, { event: "room_finished", room: { name: "other" } })).toEqual({ handled: false });
    expect(await applyLiveKitWebhookEvent(store, { event: "room_finished", room: { name: "voice-x-1" } })).toEqual({ handled: false });
  });
});
