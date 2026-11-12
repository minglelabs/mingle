import { timingSafeEqual } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { getConversationSessionKeyForMember, listChannelMemberUserIdsBySessionKey } from "@/lib/app-conversations";
import { HASH_RUSH_MESSAGE_TEXT, buildHashRushMessageClientId, type HashRushRoomGame } from "@/lib/hash-rush-message";
import { resolveOrCreateUserIdForRequest } from "@/lib/request-user-identity";
import { prisma } from "@/lib/prisma";
import { notifyConversationMessage } from "@/server/conversation-realtime";
import { hashRushRoomId, issueHashRushTicket } from "@/server/hash-rush/ticket";
import { newHashRushGuest, signHashRushInvite, verifyHashRushInvite } from "@/server/hash-rush/invite";
import { buildHashRushPcLink, HASH_RUSH_PAGE_URL, HASH_RUSH_SERVER } from "@/features/hash-rush/config";
import { listHashRushRankings, parseHashRushRoundReport, recordHashRushRound } from "@/server/hash-rush/rankings";
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

// ---------- invite link ----------

function siteOrigin(request: NextRequest): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "").trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(configured) ? configured : new URL(request.url).origin;
}

/** GET: the room's invite link (members only). It works until the chat room is deleted. */
export async function getHashRushInviteResponse(request: NextRequest, conversationId: string) {
  const secret = (process.env.HASH_RUSH_TICKET_SECRET || "").trim();
  if (!secret || !HASH_RUSH_PAGE_URL || !HASH_RUSH_SERVER) return NextResponse.json({ error: "hash_rush_unavailable" }, { status: 503 });
  const member = await requireChannelMember(request, conversationId);
  if ("response" in member) return member.response;
  const code = signHashRushInvite(conversationId, secret);
  return NextResponse.json({ url: `${siteOrigin(request)}/api/hash-rush/invite/${encodeURIComponent(code)}` });
}

const INVITE_GONE_HTML = (lang: string) => {
  const ko = lang.toLowerCase().startsWith("ko");
  const text = ko ? "이 게임 링크는 더 이상 쓸 수 없어요. 대화방이 없어졌어요." : "This game link no longer works: its chat room is gone.";
  return `<!doctype html><html lang="${ko ? "ko" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hash Rush</title></head>`
    + `<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#fff8e7;color:#3a2a1a;font:600 17px/1.5 system-ui,sans-serif;padding:24px;text-align:center">${text}</body></html>`;
};

/**
 * GET /api/hash-rush/invite/<code>: opens the room's game in the browser. A
 * member of the chat room plays under their name, anyone else as a guest.
 * Each visit gets a fresh ticket, so the link itself never runs out.
 */
export async function getHashRushInviteRedirect(request: NextRequest, code: string) {
  const secret = (process.env.HASH_RUSH_TICKET_SECRET || "").trim();
  const lang = (new URL(request.url).searchParams.get("lang") || request.headers.get("accept-language") || "en").split(",")[0].trim().slice(0, 12);
  if (!secret || !HASH_RUSH_PAGE_URL || !HASH_RUSH_SERVER) return NextResponse.json({ error: "hash_rush_unavailable" }, { status: 503 });
  const channelId = verifyHashRushInvite(code, secret);
  const channel = channelId
    ? await prisma.appConversationChannel.findFirst({ where: { id: channelId, OR: [{ isDeleted: false }, { isDeleted: null }] }, select: { id: true } })
    : null;
  if (!channel) {
    return new NextResponse(INVITE_GONE_HTML(lang), { status: 410, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  const session = await getServerSession(getAuthOptions());
  const resolvedUser = await resolveOrCreateUserIdForRequest({ request, session }).catch(() => ({ userId: null as string | null }));
  const memberKey = resolvedUser.userId
    ? await getConversationSessionKeyForMember({ conversationId: channel.id, userId: resolvedUser.userId })
    : null;
  let player: { userId: string; name: string };
  if (resolvedUser.userId && memberKey) {
    const user = await prisma.user.findUnique({ where: { id: resolvedUser.userId }, select: { name: true } });
    player = { userId: resolvedUser.userId, name: (user?.name || "").trim().slice(0, 8) };
  } else {
    player = newHashRushGuest();
  }
  const room = hashRushRoomId(channel.id);
  const { ticket } = issueHashRushTicket({ room, ...player }, secret);
  const target = new URL(buildHashRushPcLink({ pageUrl: HASH_RUSH_PAGE_URL, server: HASH_RUSH_SERVER, room, ticket, lang }));
  // The app's rooms are hosted ones: the page joins as a guest of the host.
  target.searchParams.set("host", "1");
  return NextResponse.redirect(target.toString(), { status: 302, headers: { "cache-control": "no-store" } });
}

// ---------- rankings ----------

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST from the game server after each round (its RESULTS_URL), with
 * `x-hash-rush-secret: HASH_RUSH_RESULTS_SECRET`. Keeps the people in it.
 */
export async function postHashRushResultsResponse(request: NextRequest) {
  const secret = (process.env.HASH_RUSH_RESULTS_SECRET || "").trim();
  if (!secret) return NextResponse.json({ error: "hash_rush_results_unavailable" }, { status: 503 });
  if (!sameSecret(request.headers.get("x-hash-rush-secret") || "", secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const report = parseHashRushRoundReport(await request.json().catch(() => null));
  if (!report) return NextResponse.json({ error: "invalid_result" }, { status: 400 });
  const kept = await recordHashRushRound(report);
  return NextResponse.json({ kept });
}

/** GET: everyone's ranking, with the viewer's own row. */
export async function getHashRushRankingsResponse(request: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  const resolvedUser = await resolveOrCreateUserIdForRequest({ request, session });
  if (!resolvedUser.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await listHashRushRankings({ viewerUserId: resolvedUser.userId }));
}

/** GET: one chat room's ranking, for its members. */
export async function getHashRushRoomRankingsResponse(request: NextRequest, conversationId: string) {
  const member = await requireChannelMember(request, conversationId);
  if ("response" in member) return member.response;
  return NextResponse.json(await listHashRushRankings({ channelId: conversationId, viewerUserId: member.userId }));
}
