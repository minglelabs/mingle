import { prisma } from "@/lib/prisma";
import { buildVoiceCaptionTag, type VoiceCaptionTag } from "@/lib/voice-caption";

/**
 * The caption tag for something `speakerUserId` just said in the room of
 * `sessionKey`: set when they are in that room's live call. Its readers are
 * the people in the call with interpretation on, and the speaker. Null when
 * the speaker is not in a call (an ordinary room message).
 */
export async function resolveVoiceCaptionTagForSpeech(input: {
  sessionKey: string;
  speakerUserId: string;
}): Promise<VoiceCaptionTag | null> {
  if (!input.sessionKey || !input.speakerUserId) return null;
  const call = await prisma.appVoiceCall.findFirst({
    where: {
      status: "live",
      channel: { sessionKey: input.sessionKey },
      participants: { some: { userId: input.speakerUserId, leftAt: null } },
    },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      participants: { where: { leftAt: null, interpretOn: true }, select: { userId: true } },
    },
  });
  if (!call) return null;
  return buildVoiceCaptionTag({
    callId: call.id,
    speakerUserId: input.speakerUserId,
    viewers: call.participants.map((participant) => participant.userId),
  });
}
