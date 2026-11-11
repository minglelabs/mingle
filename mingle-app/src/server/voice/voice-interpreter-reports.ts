import { timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildVoiceCaptionTag } from "@/lib/voice-caption";
import { chargeCoinUsageSafely } from "@/server/coins/wallet";
import { notifyConversationMessage } from "@/server/conversation-realtime";
import { voiceCaptionPayer } from "@/server/voice/voice-calls";

// Reports from the voice interpreter (mingle-voice-agent, app-report.ts). It
// joins a voice talk while someone there has interpretation on, writes down
// each speaker from the call audio, and tells the app about each line and
// each translation it read aloud.

/** The shared secret: VOICE_INTERNAL_SECRET, else the realtime secret both already have in one container. */
export function readVoiceInternalSecret(env: NodeJS.ProcessEnv = process.env): string {
  return (env.VOICE_INTERNAL_SECRET || env.MINGLE_REALTIME_SECRET || "").trim();
}

export function isVoiceInternalRequestAuthorized(given: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  const secret = readVoiceInternalSecret(env);
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const LANG = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})?$/;
const str = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);

export type VoiceCaptionReport = {
  room: string;
  id: string;
  speaker: string;
  lang: string;
  text: string;
  translations: Record<string, string>;
  durationMs: number;
};

export function parseVoiceCaptionReport(body: unknown): VoiceCaptionReport | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const room = str(record.room, 200);
  const id = str(record.id, 200);
  const speaker = str(record.speaker, 100);
  const lang = str(record.lang, 20);
  const text = str(record.text, 4000);
  if (!room || !id || !speaker || !lang || !LANG.test(lang) || !text) return null;
  const translations: Record<string, string> = {};
  if (record.translations && typeof record.translations === "object" && !Array.isArray(record.translations)) {
    for (const [key, value] of Object.entries(record.translations as Record<string, unknown>)) {
      const translated = str(value, 4000);
      if (LANG.test(key) && translated && key !== lang) translations[key] = translated;
    }
  }
  const durationMs = typeof record.durationMs === "number" && Number.isFinite(record.durationMs)
    ? Math.max(0, Math.min(10 * 60_000, Math.round(record.durationMs)))
    : 0;
  return { room, id, speaker, lang, text, translations, durationMs };
}

export type VoicePlaybackReport = { room: string; id: string; lang: string; listeners: string[]; audioMs: number };

export function parseVoicePlaybackReport(body: unknown): VoicePlaybackReport | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const room = str(record.room, 200);
  const id = str(record.id, 200);
  const lang = str(record.lang, 20);
  if (!room || !id || !lang || !LANG.test(lang)) return null;
  const listeners = Array.isArray(record.listeners)
    ? [...new Set(record.listeners.map((value) => str(value, 100)).filter((value): value is string => !!value))]
    : [];
  const audioMs = typeof record.audioMs === "number" && Number.isFinite(record.audioMs)
    ? Math.max(0, Math.min(10 * 60_000, Math.round(record.audioMs)))
    : 0;
  return { room, id, lang, listeners, audioMs };
}

/** The live call of a LiveKit room, with who is in it now. */
async function findLiveCallByRoom(room: string) {
  return prisma.appVoiceCall.findFirst({
    where: { livekitRoom: room, status: "live" },
    select: {
      id: true,
      channelId: true,
      channel: { select: { sessionKey: true } },
      participants: { where: { leftAt: null }, select: { userId: true, interpretOn: true } },
    },
  });
}

/**
 * Saves a line said in the call as a caption: a room message from the
 * speaker that only the people with interpretation on (and the speaker) read.
 * Its speech-to-text is charged to one reader (`voiceCaptionPayer`).
 */
export async function recordVoiceCaption(report: VoiceCaptionReport): Promise<"saved" | "no_call" | "no_readers"> {
  const call = await findLiveCallByRoom(report.room);
  if (!call || !call.participants.some((participant) => participant.userId === report.speaker)) return "no_call";
  const payer = voiceCaptionPayer(call, report.speaker);
  if (!payer) return "no_readers";
  const tag = buildVoiceCaptionTag({
    callId: call.id,
    speakerUserId: report.speaker,
    viewers: call.participants.filter((participant) => participant.interpretOn).map((participant) => participant.userId),
  });
  const sessionKey = call.channel.sessionKey;
  const clientMessageId = `voice-caption-${report.id}`.slice(0, 190);
  const targetLanguages = Object.keys(report.translations);
  const metadata: Prisma.JsonObject = {
    clientMessageId,
    sourceLanguage: report.lang,
    provider: "voice-interpreter",
    translationLanguages: targetLanguages,
    translationTargetLanguages: targetLanguages,
    voiceCaption: tag,
  };
  const message = await prisma.appMessage.upsert({
    where: { sessionKey_clientMessageId: { sessionKey, clientMessageId } },
    update: {},
    create: {
      userId: report.speaker,
      sessionKey,
      clientMessageId,
      sourceLanguage: report.lang,
      sttDurationMs: report.durationMs,
      metadata,
      contents: {
        create: [
          { contentType: "SOURCE", language: report.lang, text: report.text },
          ...Object.entries(report.translations).map(([language, text]) => ({ contentType: "TRANSLATION_FINAL", language, text })),
        ],
      },
    },
    select: { id: true },
  });
  // No text on the room's channel (others in the room watch it too): open
  // rooms reload and get what each viewer may read.
  await notifyConversationMessage(sessionKey, [], undefined, { timeoutMs: 3000 });
  if (report.durationMs > 0) {
    await chargeCoinUsageSafely({
      userId: payer,
      kind: "stt",
      units: { second: report.durationMs / 1000 },
      idempotencyKey: `voice-caption-stt:${report.id}`,
      conversationId: call.channelId,
      messageId: message.id,
      sessionKey,
    });
  }
  return "saved";
}

/** Charges each listener of a translation read aloud, when they are in the call. */
export async function recordVoicePlayback(report: VoicePlaybackReport): Promise<number> {
  if (report.audioMs <= 0 || report.listeners.length === 0) return 0;
  const call = await findLiveCallByRoom(report.room);
  if (!call) return 0;
  const inCall = new Set(call.participants.map((participant) => participant.userId));
  let charged = 0;
  for (const listener of report.listeners) {
    if (!inCall.has(listener)) continue;
    await chargeCoinUsageSafely({
      userId: listener,
      kind: "tts",
      units: { second: report.audioMs / 1000 },
      idempotencyKey: `voice-playback-tts:${report.id}:${report.lang}:${listener}`,
      conversationId: call.channelId,
      sessionKey: call.channel.sessionKey,
    });
    charged++;
  }
  return charged;
}
