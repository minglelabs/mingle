import { prisma } from "@/lib/prisma";
import type { VoiceCallRecord, VoiceStore, VoiceTx } from "@/server/voice/voice-calls";

// Event recorded on the room's timeline when a call ends. The chat UI can
// render it as "Voice talk 12:34"; metadata carries the numbers.
export const VOICE_CALL_ENDED_EVENT_TYPE = "voice_call_ended";

const callSelect = {
  id: true,
  channelId: true,
  livekitRoom: true,
  status: true,
  startedAt: true,
  maxParticipants: true,
} as const;

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function bindTx(tx: PrismaTx): VoiceTx {
  return {
    async findLiveCall(channelId) {
      return tx.appVoiceCall.findFirst({ where: { channelId, status: "live" }, select: callSelect });
    },
    async createCall(input) {
      return tx.appVoiceCall.create({
        data: { channelId: input.channelId, livekitRoom: input.livekitRoom, startedByUserId: input.startedByUserId },
        select: callSelect,
      });
    },
    async listActiveParticipants(callId) {
      const rows = await tx.appVoiceCallParticipant.findMany({
        where: { callId, leftAt: null },
        orderBy: { joinedAt: "asc" },
        select: {
          userId: true,
          interpretOn: true,
          speechLanguage: true,
          joinedAt: true,
          user: { select: { name: true, image: true } },
        },
      });
      return rows.map((row) => ({
        userId: row.userId,
        name: row.user?.name ?? null,
        image: row.user?.image ?? null,
        interpretOn: row.interpretOn,
        speechLanguage: row.speechLanguage,
        joinedAt: row.joinedAt,
      }));
    },
    async upsertActiveParticipant(input) {
      await tx.appVoiceCallParticipant.upsert({
        where: { callId_userId: { callId: input.callId, userId: input.userId } },
        create: {
          callId: input.callId,
          userId: input.userId,
          interpretOn: input.interpretOn,
          speechLanguage: input.speechLanguage,
        },
        update: {
          leftAt: null,
          interpretOn: input.interpretOn,
          speechLanguage: input.speechLanguage,
        },
      });
    },
    async markParticipantLeft(input) {
      await tx.appVoiceCallParticipant.updateMany({
        where: { callId: input.callId, userId: input.userId, leftAt: null },
        data: { leftAt: input.at },
      });
    },
    async countAllParticipants(callId) {
      return tx.appVoiceCallParticipant.count({ where: { callId } });
    },
    async endCallIfLive(input) {
      const result = await tx.appVoiceCall.updateMany({
        where: { id: input.callId, status: "live" },
        data: { status: "ended", endedAt: input.at, durationSec: input.durationSec },
      });
      if (result.count === 1) {
        await tx.appVoiceCallParticipant.updateMany({
          where: { callId: input.callId, leftAt: null },
          data: { leftAt: input.at },
        });
      }
      return result.count === 1;
    },
    async recordCallEnded(input) {
      const channel = await tx.appConversationChannel.findUnique({
        where: { id: input.channelId },
        select: { sessionKey: true },
      });
      await tx.appEventLog.create({
        data: {
          eventType: VOICE_CALL_ENDED_EVENT_TYPE,
          sessionKey: channel?.sessionKey ?? null,
          metadata: {
            kind: VOICE_CALL_ENDED_EVENT_TYPE,
            callId: input.callId,
            durationSec: input.durationSec,
            participantCount: input.participantCount,
          },
        },
      });
    },
  };
}

export const prismaVoiceStore: VoiceStore = {
  async withChannelLock(channelId, fn) {
    return prisma.$transaction(async (tx) => {
      // Serialize joins/leaves per channel so the 8-person cap and the
      // single-live-call rule hold under concurrent requests.
      await tx.$queryRaw`SELECT id FROM app_conversation_channels WHERE id = ${channelId} FOR UPDATE`;
      return fn(bindTx(tx));
    });
  },
  async findCallByRoom(livekitRoom): Promise<VoiceCallRecord | null> {
    return prisma.appVoiceCall.findUnique({ where: { livekitRoom }, select: callSelect });
  },
};
