import { after, NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { getConversationSessionKeyForMember, listChannelMemberUserIdsBySessionKey } from "@/lib/app-conversations";
import { HASH_RUSH_MESSAGE_TEXT, buildHashRushMessageClientId, type HashRushRoomGame } from "@/lib/hash-rush-message";
import { resolveOrCreateUserIdForRequest } from "@/lib/request-user-identity";
import { prisma } from "@/lib/prisma";
import { notifyConversationMessage } from "@/server/conversation-realtime";
import { hashRushRoomId, issueHashRushTicket } from "@/server/hash-rush/ticket";
import { isHashRushGameLive, joinHashRushGame, prismaHashRushGameStore, type HashRushGameStore } from "@/server/hash-rush/room-game";

export const runtime = "nodejs";

let store: HashRushGameStore = prismaHashRushGameStore;
export function setHashRushGameStoreForTests(next: HashRushGameStore | null) {
  store = next ?? prismaHashRushGameStore;
}

// "<name> started Hash Rush" in the room, with a Join button. Open rooms load
// it at once; room lists show it as the latest message.
let announceGameStarted = async (input: { sessionKey: string; sessionId: string; starterUserId: string }) => {
  const clientMessageId = buildHashRushMessageClientId(input.sessionId);
  await prisma.appMessage.upsert({
    where: { sessionKey_clientMessageId: { sessionKey: input.sessionKey, clientMessageId } },
    update: {},
    create: {
      userId: input.starterUserId,
      sessionKey: input.sessionKey,
      clientMessageId,
      sourceLanguage: "en",
      metadata: { hashRush: { sessionId: input.sessionId } },
      contents: { create: { contentType: "SOURCE", language: "en", text: HASH_RUSH_MESSAGE_TEXT } },
    },
  });
  const memberUserIds = await listChannelMemberUserIdsBySessionKey(input.sessionKey);
  await notifyConversationMessage(input.sessionKey, memberUserIds, undefined, { timeoutMs: 3000 });
};
export function setHashRushAnnouncerForTests(next: typeof announceGameStarted | null) {
  if (next) announceGameStarted = next;
}

type MemberCheck = { userId: string; sessionKey: string } | { response: NextResponse };

async function requireChannelMember(request: NextRequest, conversationId: string): Promise<MemberCheck> {
  const session = await getServerSession(getAuthOptions());
  const resolvedUser = await resolveOrCreateUserIdForRequest({ request, session });
  if (!resolvedUser.userId) return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const sessionKey = await getConversationSessionKeyForMember({ conversationId, userId: resolvedUser.userId });
  if (!sessionKey) return { response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { userId: resolvedUser.userId, sessionKey };
}

async function describeGame(sessionId: string, startedByUserId: string | null): Promise<HashRushRoomGame> {
  if (!startedByUserId) return { sessionId, startedBy: null };
  const starter = await prisma.user.findUnique({ where: { id: startedByUserId }, select: { name: true } }).catch(() => null);
  return { sessionId, startedBy: { userId: startedByUserId, name: starter?.name ?? null } };
}

// A member of the chat room gets a short-lived ticket into that room's game.
export async function postHashRushTicketResponse(request: NextRequest, conversationId: string) {
  const secret = (process.env.HASH_RUSH_TICKET_SECRET || "").trim();
  if (!secret) return NextResponse.json({ error: "hash_rush_unavailable" }, { status: 503 });

  const member = await requireChannelMember(request, conversationId);
  if ("response" in member) return member.response;

  const user = await prisma.user.findUnique({ where: { id: member.userId }, select: { name: true } });
  const name = (user?.name || "").trim().slice(0, 8);
  const room = hashRushRoomId(conversationId);
  const { ticket, exp, expiresIn } = issueHashRushTicket({ room, userId: member.userId, name }, secret);
  return NextResponse.json({ ticket, room, name, exp, expiresIn });
}

/** GET: the room's running game, or `{ game: null }`. */
export async function getHashRushGameResponse(request: NextRequest, conversationId: string) {
  const member = await requireChannelMember(request, conversationId);
  if ("response" in member) return member.response;
  const record = await store.read(conversationId);
  if (!isHashRushGameLive(record, new Date())) return NextResponse.json({ game: null });
  return NextResponse.json({ game: await describeGame(record.sessionId, record.startedByUserId) });
}

/**
 * POST { sessionId? }: joins the room's game, starting one when none runs.
 * A phone in the game sends this again every 15 s with its game's sessionId.
 */
export async function postHashRushJoinResponse(request: NextRequest, conversationId: string) {
  const member = await requireChannelMember(request, conversationId);
  if ("response" in member) return member.response;
  const body = await request.json().catch(() => null) as { sessionId?: unknown } | null;
  const sessionId = typeof body?.sessionId === "string" && body.sessionId.trim() ? body.sessionId.trim() : null;

  let result;
  try {
    result = await joinHashRushGame(store, { channelId: conversationId, userId: member.userId, sessionId });
  } catch (error) {
    console.error("[hash-rush] join_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "hash_rush_join_failed" }, { status: 409 });
  }

  if (result.started) {
    const sessionKey = member.sessionKey;
    const starterUserId = member.userId;
    after(async () => {
      try {
        await announceGameStarted({ sessionKey, sessionId: result.sessionId, starterUserId });
      } catch (error) {
        console.error("[hash-rush] start_message_failed", error instanceof Error ? error.name : "unknown");
      }
    });
  }
  return NextResponse.json({ game: await describeGame(result.sessionId, result.startedByUserId), started: result.started });
}
