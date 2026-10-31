// Group voice room state machine. Pure logic over a small VoiceStore so the
// rules (8-person cap, one live call per channel, idempotent end) are testable
// without a database. prisma-voice-store.ts is the production store.

export const VOICE_MAX_PARTICIPANTS = 8;
export const INTERPRETER_IDENTITY_PREFIX = "interpreter-";

export type VoiceCallRecord = {
  id: string;
  channelId: string;
  livekitRoom: string;
  status: string;
  startedAt: Date;
  maxParticipants: number;
};

export type VoiceParticipantRecord = {
  userId: string;
  name: string | null;
  image: string | null;
  interpretOn: boolean;
  speechLanguage: string | null;
  joinedAt: Date;
};

// Every method runs inside the channel-scoped transaction opened by
// VoiceStore.withChannelLock, so reads and writes see one consistent state.
export interface VoiceTx {
  findLiveCall(channelId: string): Promise<VoiceCallRecord | null>;
  createCall(input: { channelId: string; livekitRoom: string; startedByUserId: string }): Promise<VoiceCallRecord>;
  listActiveParticipants(callId: string): Promise<VoiceParticipantRecord[]>;
  upsertActiveParticipant(input: {
    callId: string;
    userId: string;
    interpretOn: boolean;
    speechLanguage: string | null;
  }): Promise<void>;
  markParticipantLeft(input: { callId: string; userId: string; at: Date }): Promise<void>;
  countAllParticipants(callId: string): Promise<number>;
  // Flips live -> ended. Returns true only for the caller that actually ended it.
  endCallIfLive(input: { callId: string; at: Date; durationSec: number }): Promise<boolean>;
  recordCallEnded(input: {
    channelId: string;
    callId: string;
    durationSec: number;
    participantCount: number;
  }): Promise<void>;
}

export interface VoiceStore {
  withChannelLock<T>(channelId: string, fn: (tx: VoiceTx) => Promise<T>): Promise<T>;
  findCallByRoom(livekitRoom: string): Promise<VoiceCallRecord | null>;
}

export type VoiceCallView = {
  id: string;
  status: "live" | "ended" | string;
  room: string;
  startedAt: string;
  maxParticipants: number;
  participants: Array<{
    userId: string;
    name: string | null;
    image: string | null;
    interpretOn: boolean;
    speechLanguage: string | null;
    joinedAt: string;
  }>;
};

export class VoiceRoomFullError extends Error {
  constructor() {
    super("voice_room_full");
    this.name = "VoiceRoomFullError";
  }
}

export function isInterpreterIdentity(identity: string | null | undefined): boolean {
  return typeof identity === "string" && identity.startsWith(INTERPRETER_IDENTITY_PREFIX);
}

export function buildLiveKitRoomName(channelId: string, now: Date = new Date()): string {
  return `voice-${channelId}-${now.getTime().toString(36)}`;
}

export function toCallView(call: VoiceCallRecord, participants: VoiceParticipantRecord[]): VoiceCallView {
  return {
    id: call.id,
    status: call.status,
    room: call.livekitRoom,
    startedAt: call.startedAt.toISOString(),
    maxParticipants: call.maxParticipants,
    participants: participants.map((participant) => ({
      userId: participant.userId,
      name: participant.name,
      image: participant.image,
      interpretOn: participant.interpretOn,
      speechLanguage: participant.speechLanguage,
      joinedAt: participant.joinedAt.toISOString(),
    })),
  };
}

export async function getLiveCallView(store: VoiceStore, channelId: string): Promise<VoiceCallView | null> {
  return store.withChannelLock(channelId, async (tx) => {
    const call = await tx.findLiveCall(channelId);
    if (!call) return null;
    return toCallView(call, await tx.listActiveParticipants(call.id));
  });
}

export async function joinVoiceCall(
  store: VoiceStore,
  input: { channelId: string; userId: string; lang: string | null; interpretOn: boolean; now?: Date },
): Promise<VoiceCallView> {
  const now = input.now ?? new Date();
  return store.withChannelLock(input.channelId, async (tx) => {
    let call = await tx.findLiveCall(input.channelId);
    if (!call) {
      call = await tx.createCall({
        channelId: input.channelId,
        livekitRoom: buildLiveKitRoomName(input.channelId, now),
        startedByUserId: input.userId,
      });
    }
    const active = await tx.listActiveParticipants(call.id);
    const alreadyIn = active.some((participant) => participant.userId === input.userId);
    if (!alreadyIn && active.length >= Math.min(call.maxParticipants, VOICE_MAX_PARTICIPANTS)) {
      throw new VoiceRoomFullError();
    }
    await tx.upsertActiveParticipant({
      callId: call.id,
      userId: input.userId,
      interpretOn: input.interpretOn,
      speechLanguage: input.lang,
    });
    return toCallView(call, await tx.listActiveParticipants(call.id));
  });
}

async function endCallInTx(tx: VoiceTx, call: VoiceCallRecord, at: Date): Promise<boolean> {
  const durationSec = Math.max(0, Math.round((at.getTime() - call.startedAt.getTime()) / 1000));
  const ended = await tx.endCallIfLive({ callId: call.id, at, durationSec });
  if (!ended) return false;
  await tx.recordCallEnded({
    channelId: call.channelId,
    callId: call.id,
    durationSec,
    participantCount: await tx.countAllParticipants(call.id),
  });
  return true;
}

export async function leaveVoiceCall(
  store: VoiceStore,
  input: { channelId: string; userId: string; now?: Date },
): Promise<{ ended: boolean }> {
  const now = input.now ?? new Date();
  return store.withChannelLock(input.channelId, async (tx) => {
    const call = await tx.findLiveCall(input.channelId);
    if (!call) return { ended: false };
    await tx.markParticipantLeft({ callId: call.id, userId: input.userId, at: now });
    const remaining = await tx.listActiveParticipants(call.id);
    if (remaining.length > 0) return { ended: false };
    return { ended: await endCallInTx(tx, call, now) };
  });
}

// Seats held by apps that crashed or lost signal never call leave, and without
// the webhook nothing frees them, so 8 of them would lock the room. Before a
// join, drop anyone LiveKit no longer has (after a grace for people mid-join),
// and end the call if nobody is left.
export const RECONCILE_GRACE_MS = 45_000;

export async function reconcileLiveCall(
  store: VoiceStore,
  input: {
    channelId: string;
    listIdentities: (room: string) => Promise<string[] | null>;
    now?: Date;
  },
): Promise<{ dropped: string[]; ended: boolean }> {
  const now = input.now ?? new Date();
  const live = await store.withChannelLock(input.channelId, (tx) => tx.findLiveCall(input.channelId));
  if (!live) return { dropped: [], ended: false };
  const present = await input.listIdentities(live.livekitRoom);
  if (present === null) return { dropped: [], ended: false };
  const here = new Set(present);
  return store.withChannelLock(input.channelId, async (tx) => {
    const call = await tx.findLiveCall(input.channelId);
    if (!call || call.id !== live.id) return { dropped: [], ended: false };
    const dropped: string[] = [];
    for (const participant of await tx.listActiveParticipants(call.id)) {
      if (here.has(participant.userId)) continue;
      if (now.getTime() - participant.joinedAt.getTime() < RECONCILE_GRACE_MS) continue;
      await tx.markParticipantLeft({ callId: call.id, userId: participant.userId, at: now });
      dropped.push(participant.userId);
    }
    if (dropped.length && (await tx.listActiveParticipants(call.id)).length === 0) {
      return { dropped, ended: await endCallInTx(tx, call, now) };
    }
    return { dropped, ended: false };
  });
}

export type LiveKitWebhookEvent = {
  event?: string;
  room?: { name?: string };
  participant?: { identity?: string; attributes?: Record<string, string> };
};

// Applies one LiveKit webhook event. Interpreter participants never count as
// humans. room_finished ends the call at most once, however often it repeats.
export async function applyLiveKitWebhookEvent(
  store: VoiceStore,
  event: LiveKitWebhookEvent,
  now: Date = new Date(),
): Promise<{ handled: boolean; ended?: boolean }> {
  const roomName = event.room?.name;
  if (!roomName || !roomName.startsWith("voice-")) return { handled: false };
  const call = await store.findCallByRoom(roomName);
  if (!call) return { handled: false };
  const identity = event.participant?.identity;

  return store.withChannelLock(call.channelId, async (tx) => {
    const live = await tx.findLiveCall(call.channelId);
    const current = live && live.id === call.id ? live : null;

    switch (event.event) {
      case "participant_joined": {
        if (!current || !identity || isInterpreterIdentity(identity)) return { handled: true };
        const attributes = event.participant?.attributes ?? {};
        await tx.upsertActiveParticipant({
          callId: call.id,
          userId: identity,
          interpretOn: attributes.interpret !== "off",
          speechLanguage: attributes.lang || null,
        });
        return { handled: true };
      }
      case "participant_left": {
        if (!current || !identity || isInterpreterIdentity(identity)) return { handled: true };
        await tx.markParticipantLeft({ callId: call.id, userId: identity, at: now });
        return { handled: true };
      }
      case "room_finished": {
        if (!current) return { handled: true, ended: false };
        return { handled: true, ended: await endCallInTx(tx, current, now) };
      }
      default:
        return { handled: true };
    }
  });
}
