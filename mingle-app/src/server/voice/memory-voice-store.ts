import type { VoiceCallRecord, VoiceStore, VoiceTx } from "@/server/voice/voice-calls";

// In-memory VoiceStore for unit tests. Mirrors the Prisma store's semantics:
// one live call per channel, participant rows kept after leaving.

type ParticipantRow = {
  callId: string;
  userId: string;
  interpretOn: boolean;
  speechLanguage: string | null;
  joinedAt: Date;
  leftAt: Date | null;
};

export type MemoryVoiceStore = VoiceStore & {
  calls: Array<VoiceCallRecord & { endedAt: Date | null; durationSec: number | null }>;
  participants: ParticipantRow[];
  endedEvents: Array<{ channelId: string; callId: string; durationSec: number; participantCount: number }>;
  names: Map<string, string>;
};

export function createMemoryVoiceStore(): MemoryVoiceStore {
  let seq = 0;
  const memory: MemoryVoiceStore = {
    calls: [],
    participants: [],
    endedEvents: [],
    names: new Map(),
    async withChannelLock(_channelId, fn) {
      return fn(tx);
    },
    async findCallByRoom(livekitRoom) {
      return memory.calls.find((call) => call.livekitRoom === livekitRoom) ?? null;
    },
  };

  const tx: VoiceTx = {
    async findLiveCall(channelId) {
      return memory.calls.find((call) => call.channelId === channelId && call.status === "live") ?? null;
    },
    async createCall(input) {
      seq += 1;
      const call = {
        id: `call-${seq}`,
        channelId: input.channelId,
        livekitRoom: input.livekitRoom,
        status: "live",
        startedAt: new Date(Date.UTC(2026, 9, 31, 12, 0, 0)),
        maxParticipants: 8,
        endedAt: null,
        durationSec: null,
      };
      memory.calls.push(call);
      return call;
    },
    async listActiveParticipants(callId) {
      return memory.participants
        .filter((row) => row.callId === callId && row.leftAt === null)
        .map((row) => ({
          userId: row.userId,
          name: memory.names.get(row.userId) ?? null,
          image: null,
          interpretOn: row.interpretOn,
          speechLanguage: row.speechLanguage,
          joinedAt: row.joinedAt,
        }));
    },
    async upsertActiveParticipant(input) {
      const existing = memory.participants.find((row) => row.callId === input.callId && row.userId === input.userId);
      if (existing) {
        existing.leftAt = null;
        existing.interpretOn = input.interpretOn;
        existing.speechLanguage = input.speechLanguage;
        return;
      }
      memory.participants.push({ ...input, joinedAt: new Date(), leftAt: null });
    },
    async markParticipantLeft(input) {
      for (const row of memory.participants) {
        if (row.callId === input.callId && row.userId === input.userId && row.leftAt === null) row.leftAt = input.at;
      }
    },
    async countAllParticipants(callId) {
      return memory.participants.filter((row) => row.callId === callId).length;
    },
    async endCallIfLive(input) {
      const call = memory.calls.find((row) => row.id === input.callId && row.status === "live");
      if (!call) return false;
      call.status = "ended";
      call.endedAt = input.at;
      call.durationSec = input.durationSec;
      for (const row of memory.participants) {
        if (row.callId === call.id && row.leftAt === null) row.leftAt = input.at;
      }
      return true;
    },
    async recordCallEnded(input) {
      memory.endedEvents.push(input);
    },
  };

  return memory;
}
