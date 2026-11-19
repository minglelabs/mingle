import { describe, expect, it } from "vitest";
import { createMemoryVoiceStore } from "@/server/voice/memory-voice-store";
import { mintVoiceJoinToken, setRoomParticipantCanPublish, verifyHs256 } from "@/server/voice/livekit-auth";
import { joinVoiceCall, leaveVoiceCall, VoiceRoomFullError } from "@/server/voice/voice-calls";
import { changeVoiceStage, isVoiceStageAction } from "@/server/voice/voice-stage";

const CHANNEL = "room-1";
const stage = { hostUserId: "host" };
const join = (store: ReturnType<typeof createMemoryVoiceStore>, userId: string, withStage = true) =>
  joinVoiceCall(store, { channelId: CHANNEL, userId, lang: "ko", interpretOn: false, ...(withStage ? { stage } : {}) });
const roleOf = (call: { participants: Array<{ userId: string; role: string }> }, userId: string) =>
  call.participants.find((participant) => participant.userId === userId)?.role;

describe("open room call: who is on the stage when they join", () => {
  it("puts the one who starts the call and the host on the stage, everyone else in as a listener", async () => {
    const store = createMemoryVoiceStore();
    expect(roleOf(await join(store, "starter"), "starter")).toBe("speaker");
    expect(roleOf(await join(store, "guest"), "guest")).toBe("listener");
    expect(roleOf(await join(store, "host"), "host")).toBe("speaker");
  });

  it("does not count listeners against the stage's seats", async () => {
    const store = createMemoryVoiceStore();
    await join(store, "host");
    for (let i = 0; i < 12; i += 1) await join(store, `guest-${i}`);
    const call = await join(store, "guest-12");
    expect(call.participants).toHaveLength(14);
    expect(call.participants.filter((participant) => participant.role === "speaker")).toHaveLength(1);
  });

  it("keeps a chat room's call as it was: everyone speaks, and the ninth is refused", async () => {
    const store = createMemoryVoiceStore();
    for (let i = 0; i < 8; i += 1) expect(roleOf(await join(store, `user-${i}`, false), `user-${i}`)).toBe("speaker");
    await expect(join(store, "user-8", false)).rejects.toBeInstanceOf(VoiceRoomFullError);
  });

  it("keeps a seat the host gave across a reconnect", async () => {
    const store = createMemoryVoiceStore();
    await join(store, "host");
    await join(store, "guest");
    await changeVoiceStage(store, { channelId: CHANNEL, actorUserId: "host", hostUserId: "host", action: "invite", targetUserId: "guest" });
    await leaveVoiceCall(store, { channelId: CHANNEL, userId: "guest" });
    expect(roleOf(await join(store, "guest"), "guest")).toBe("speaker");
  });
});

describe("open room call: raising a hand and the host's stage", () => {
  const setUp = async () => {
    const store = createMemoryVoiceStore();
    await join(store, "host");
    await join(store, "guest");
    return store;
  };
  const act = (store: ReturnType<typeof createMemoryVoiceStore>, actorUserId: string, action: Parameters<typeof changeVoiceStage>[1]["action"], targetUserId?: string) =>
    changeVoiceStage(store, { channelId: CHANNEL, actorUserId, hostUserId: "host", action, targetUserId });

  it("lets a listener raise a hand and take it back", async () => {
    const store = await setUp();
    const raised = await act(store, "guest", "raise");
    expect(raised.ok && raised.call.participants.find((participant) => participant.userId === "guest")?.handRaised).toBe(true);
    expect(raised.ok && raised.changed).toBeNull();
    const lowered = await act(store, "guest", "lower");
    expect(lowered.ok && lowered.call.participants.find((participant) => participant.userId === "guest")?.handRaised).toBe(false);
  });

  it("lets only the host put someone on the stage, which clears their hand", async () => {
    const store = await setUp();
    await act(store, "guest", "raise");
    expect(await act(store, "guest", "invite", "host")).toEqual({ ok: false, error: "forbidden" });
    const invited = await act(store, "host", "invite", "guest");
    expect(invited.ok && invited.changed).toEqual({ userId: "guest", role: "speaker" });
    expect(invited.ok && invited.call.participants.find((participant) => participant.userId === "guest")).toMatchObject({ role: "speaker", handRaised: false });
  });

  it("lets the host take a speaker off the stage, and a speaker step down", async () => {
    const store = await setUp();
    await act(store, "host", "invite", "guest");
    const removed = await act(store, "host", "remove", "guest");
    expect(removed.ok && removed.changed).toEqual({ userId: "guest", role: "listener" });
    await act(store, "host", "invite", "guest");
    const stepped = await act(store, "guest", "step_down");
    expect(stepped.ok && stepped.changed).toEqual({ userId: "guest", role: "listener" });
  });

  it("refuses an invite when the stage is full, and a target who is not in the call", async () => {
    const store = createMemoryVoiceStore();
    await join(store, "host");
    for (let i = 0; i < 8; i += 1) await join(store, `guest-${i}`);
    for (let i = 0; i < 7; i += 1) await act(store, "host", "invite", `guest-${i}`);
    expect(await act(store, "host", "invite", "guest-7")).toEqual({ ok: false, error: "stage_full" });
    expect(await act(store, "host", "invite", "nobody")).toEqual({ ok: false, error: "invalid_target" });
    expect(await act(store, "host", "remove", "host")).toEqual({ ok: false, error: "invalid_target" });
  });

  it("answers no_call and not_in_call", async () => {
    const store = createMemoryVoiceStore();
    expect(await act(store, "host", "raise")).toEqual({ ok: false, error: "no_call" });
    await join(store, "host");
    expect(await act(store, "stranger", "raise")).toEqual({ ok: false, error: "not_in_call" });
    expect(isVoiceStageAction("invite")).toBe(true);
    expect(isVoiceStageAction("kick")).toBe(false);
  });
});

describe("open room call: the media server follows the stage", () => {
  const config = { url: "wss://lk.example", apiKey: "key", apiSecret: "secret" };

  it("gives a listener a token that cannot send a voice", () => {
    const read = (canPublish?: boolean) => {
      const token = mintVoiceJoinToken({ config, room: "r", identity: "u", name: "U", attributes: {}, ...(canPublish === undefined ? {} : { canPublish }) });
      return (verifyHs256(token, config.apiSecret)?.video as { canPublish?: boolean }).canPublish;
    };
    expect(read(false)).toBe(false);
    expect(read(true)).toBe(true);
    expect(read()).toBe(true);
  });

  it("tells LiveKit to stop or allow a participant's voice", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    expect(await setRoomParticipantCanPublish(config, { room: "voice-r", identity: "guest", canPublish: false }, fetchImpl)).toBe(true);
    expect(calls[0].url).toBe("https://lk.example/twirp/livekit.RoomService/UpdateParticipant");
    expect(calls[0].body).toMatchObject({ room: "voice-r", identity: "guest", permission: { can_publish: false, can_subscribe: true } });
    const failing = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    expect(await setRoomParticipantCanPublish(config, { room: "voice-r", identity: "guest", canPublish: true }, failing)).toBe(false);
  });
});
