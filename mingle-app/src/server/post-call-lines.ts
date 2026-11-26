import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isPostCallOver } from "@/lib/post-call";
import { translateTexts } from "@/server/translation/translate-texts";

/**
 * What the two write on the call screen of a 1:1 voice talk from a post
 * (owner, 2026-11-26). The screen is not a chat room, so it does not go
 * through the room's speech-to-text pipeline: a typed line is translated into
 * the other person's language here and kept as a message of the call's hidden
 * room (the call screen reads them back; nothing else lists that room).
 * Photos go through the room's own image upload.
 */

export const POST_CALL_LINE_MAX = 500;

export type PostCallLine = {
  id: string;
  userId: string;
  text: string;
  language: string;
  /** Per language. */
  translations: Record<string, string>;
  /** A photo: the address that serves it. */
  imageUrl: string | null;
  createdAt: string;
};

type CallScope = { callId: string; channelId: string; sessionKey: string; userId: string; peerId: string; status: string };

async function scopeFor(callId: string, userId: string): Promise<CallScope | null> {
  const call = await prisma.postCall.findUnique({
    where: { id: callId },
    select: { id: true, callerId: true, authorId: true, channelId: true, status: true },
  });
  if (!call || (call.callerId !== userId && call.authorId !== userId)) return null;
  const channel = await prisma.appConversationChannel.findUnique({ where: { id: call.channelId }, select: { sessionKey: true } });
  if (!channel) return null;
  return {
    callId: call.id,
    channelId: call.channelId,
    sessionKey: channel.sessionKey,
    userId,
    peerId: call.callerId === userId ? call.authorId : call.callerId,
    status: call.status,
  };
}

function baseLanguage(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

export async function addPostCallLine(args: { callId: string; userId: string; text: string; clientId?: string }): Promise<{ ok: true; line: PostCallLine } | { ok: false; error: "not_found" | "over" | "empty" }> {
  const text = args.text.trim().slice(0, POST_CALL_LINE_MAX);
  if (!text) return { ok: false, error: "empty" };
  const scope = await scopeFor(args.callId, args.userId);
  if (!scope) return { ok: false, error: "not_found" };
  if (isPostCallOver(scope.status) && scope.status !== "ended") return { ok: false, error: "over" };
  const [me, peer] = await Promise.all([
    prisma.user.findUnique({ where: { id: scope.userId }, select: { primaryLanguages: true } }),
    prisma.user.findUnique({ where: { id: scope.peerId }, select: { primaryLanguages: true } }),
  ]);
  const mine = me?.primaryLanguages?.[0] ?? "";
  const theirs = peer?.primaryLanguages?.[0] ?? "";
  // Into the other person's language; into mine too, in case I wrote in another.
  const targets = [...new Set([theirs, mine].filter(Boolean))];
  let sourceLanguage = mine || "unknown";
  let translations: Record<string, string> = {};
  if (targets.length > 0) {
    try {
      const result = await translateTexts({ text, sourceLanguage: "unknown", targetLanguages: targets, redetectSourceLanguage: true, isFinal: true });
      sourceLanguage = result.detectedSourceLanguage || sourceLanguage;
      translations = Object.fromEntries(Object.entries(result.translations)
        .filter(([language, value]) => value.trim() && baseLanguage(language) !== baseLanguage(sourceLanguage)));
    } catch (error) {
      // The line still goes through, untranslated.
      console.warn("[post-call] line_translate_failed", error instanceof Error ? error.name : "unknown");
    }
  }
  const clientMessageId = /^[\w-]{12,128}$/.test(args.clientId ?? "") ? `post-call-${args.clientId}` : `post-call-${randomUUID()}`;
  const message = await prisma.appMessage.upsert({
    where: { sessionKey_clientMessageId: { sessionKey: scope.sessionKey, clientMessageId } },
    update: {},
    create: {
      userId: scope.userId,
      sessionKey: scope.sessionKey,
      clientMessageId,
      sourceLanguage,
      contents: {
        create: [
          { contentType: "SOURCE", language: sourceLanguage, text },
          ...Object.entries(translations).map(([language, value]) => ({ contentType: "TRANSLATION_FINAL", language, text: value })),
        ],
      },
    },
    select: { id: true, createdAt: true },
  });
  return { ok: true, line: { id: message.id, userId: scope.userId, text, language: sourceLanguage, translations, imageUrl: null, createdAt: message.createdAt.toISOString() } };
}

/** The lines of the call so far (oldest first), photos included. */
export async function listPostCallLines(args: { callId: string; userId: string; apiPrefix: string }): Promise<PostCallLine[] | null> {
  const scope = await scopeFor(args.callId, args.userId);
  if (!scope) return null;
  const messages = await prisma.appMessage.findMany({
    where: { sessionKey: scope.sessionKey, OR: [{ isDeleted: null }, { isDeleted: false }] },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      userId: true,
      sourceLanguage: true,
      metadata: true,
      createdAt: true,
      contents: { select: { contentType: true, language: true, text: true } },
    },
  });
  return messages.flatMap((message): PostCallLine[] => {
    const metadata = (message.metadata ?? {}) as Record<string, unknown>;
    // The call's own captions are read from the call itself, not from here.
    if (metadata.voiceCaption || metadata.voiceCall) return [];
    const source = message.contents.find((content) => content.contentType === "SOURCE");
    const isImage = Boolean(metadata.image);
    if (!source && !isImage) return [];
    return [{
      id: message.id,
      userId: message.userId ?? "",
      text: isImage ? "" : source?.text ?? "",
      language: source?.language ?? message.sourceLanguage ?? "",
      translations: Object.fromEntries(message.contents
        .filter((content) => content.contentType === "TRANSLATION_FINAL")
        .map((content) => [content.language, content.text])),
      imageUrl: isImage ? `${args.apiPrefix}/conversations/${encodeURIComponent(scope.channelId)}/images/${encodeURIComponent(message.id)}` : null,
      createdAt: message.createdAt.toISOString(),
    }];
  });
}
