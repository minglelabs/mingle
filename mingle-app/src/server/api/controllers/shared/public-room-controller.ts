import { after, NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import {
  decideConversationJoinRequest,
  findConversationByRoomCode,
  joinOrRequestByRoomCode,
  joinPublicConversationChannel,
  listConversationJoinRequests,
  listChannelMemberUserIdsBySessionKey,
  listLiveRooms,
  setConversationPublic,
} from "@/lib/app-conversations";
import { resolveOrCreateUserIdForRequest } from "@/lib/request-user-identity";
import { notifyConversationMessage } from "@/server/conversation-realtime";
import { sendPushNotificationForConversationJoinRequest } from "@/server/push-notifications";
import { parseRoomCode } from "@/lib/room-code";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function resolveUserId(request: NextRequest): Promise<string> {
  const session = await getServerSession(getAuthOptions());
  const resolved = await resolveOrCreateUserIdForRequest({ request, session, createIfMissing: false });
  return resolved.userId;
}

/** POST { isPublic } — a member makes the room public (listed + joinable from the search tab) or private. */
export async function postConversationVisibilityResponse(request: NextRequest, conversationId: string) {
  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { isPublic?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.isPublic !== "boolean") return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const conversation = await setConversationPublic({ conversationId, userId, isPublic: body.isPublic });
  if (!conversation) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const memberUserIds = await listChannelMemberUserIdsBySessionKey(conversation.sessionKey).catch(() => []);
  await notifyConversationMessage("", memberUserIds, undefined, { timeoutMs: 3000 });
  return NextResponse.json({ conversation, isPublic: conversation.isPublic === true });
}

/** GET — rooms with a live voice talk call or a running Hash Rush game, for the search tab. */
export async function getLiveRoomsResponse(request: NextRequest) {
  const userId = await resolveUserId(request).catch(() => "");
  const rooms = await listLiveRooms(userId || null);
  return NextResponse.json({ rooms }, { headers: { "cache-control": "no-store" } });
}

/** POST — join a public room from the search tab. */
export async function postPublicRoomJoinResponse(request: NextRequest, conversationId: string) {
  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let conversation;
  try {
    conversation = await joinPublicConversationChannel({ conversationId, userId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "room_full") return NextResponse.json({ error: "room_full" }, { status: 400 });
    if (code === "target_user_blocked") return NextResponse.json({ error: "target_user_blocked" }, { status: 403 });
    console.error("[conversations] public_join_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "conversation_channel_join_conflict" }, { status: 409 });
  }
  if (!conversation) return NextResponse.json({ error: "not_public" }, { status: 404 });
  const memberUserIds = await listChannelMemberUserIdsBySessionKey(conversation.sessionKey).catch(() => []);
  await notifyConversationMessage(conversation.sessionKey, memberUserIds);
  return NextResponse.json({ conversation });
}

function readCode(raw: string): number | null {
  return parseRoomCode(decodeURIComponent(raw || ""));
}

/** GET — find a room by its number (Search). A private room stays nameless to non-members. */
export async function getRoomByCodeResponse(request: NextRequest, rawCode: string) {
  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const code = readCode(rawCode);
  if (!code) return NextResponse.json({ error: "invalid_room_code" }, { status: 400 });
  const room = await findConversationByRoomCode(code, userId);
  if (!room) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ room }, { headers: { "cache-control": "no-store" } });
}

async function roomTitleAndMembers(channelId: string) {
  const channel = await prisma.appConversationChannel.findUnique({ where: { id: channelId }, select: { title: true, sessionKey: true } });
  const memberUserIds = channel ? await listChannelMemberUserIdsBySessionKey(channel.sessionKey).catch(() => []) : [];
  return { title: channel?.title ?? "", sessionKey: channel?.sessionKey ?? "", memberUserIds };
}

/** POST — by number: a public room is joined at once; a private room gets a join request its members see. */
export async function postRoomByCodeJoinResponse(request: NextRequest, rawCode: string) {
  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const code = readCode(rawCode);
  if (!code) return NextResponse.json({ error: "invalid_room_code" }, { status: 400 });
  let result;
  try {
    result = await joinOrRequestByRoomCode(code, userId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (reason === "room_full") return NextResponse.json({ error: "room_full" }, { status: 400 });
    if (reason === "target_user_blocked") return NextResponse.json({ error: "target_user_blocked" }, { status: 403 });
    console.error("[conversations] room_code_join_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "conversation_channel_join_conflict" }, { status: 409 });
  }
  if (result.kind === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (result.kind === "joined") {
    const memberUserIds = await listChannelMemberUserIdsBySessionKey(result.conversation.sessionKey).catch(() => []);
    await notifyConversationMessage(result.conversation.sessionKey, memberUserIds);
    return NextResponse.json({ joined: true, conversation: result.conversation });
  }
  if (result.created) {
    const { channelId, requestId } = result;
    after(async () => {
      try {
        const room = await roomTitleAndMembers(channelId);
        // Members' lists and open rooms refresh, so the request shows up without a reload.
        await notifyConversationMessage(room.sessionKey, room.memberUserIds, undefined, { timeoutMs: 3000 });
        await sendPushNotificationForConversationJoinRequest({
          kind: "request", channelId, requestId, requesterUserId: userId, recipientUserIds: room.memberUserIds, roomTitle: room.title,
        });
      } catch (error) {
        console.error("[conversations] join_request_notify_failed", error instanceof Error ? error.name : "unknown");
      }
    });
  }
  return NextResponse.json({ joined: false, requested: true });
}

/** GET — a room's pending join requests (members only). */
export async function getConversationJoinRequestsResponse(request: NextRequest, conversationId: string) {
  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const requests = await listConversationJoinRequests({ conversationId, userId });
  if (!requests) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ requests }, { headers: { "cache-control": "no-store" } });
}

/** POST { accept } — a member decides a join request. */
export async function postConversationJoinRequestDecisionResponse(request: NextRequest, conversationId: string, requestId: string) {
  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { accept?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.accept !== "boolean") return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  let decision;
  try {
    decision = await decideConversationJoinRequest({ conversationId, requestId, userId, accept: body.accept });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (reason === "room_full") return NextResponse.json({ error: "room_full" }, { status: 400 });
    if (reason === "target_user_blocked") return NextResponse.json({ error: "target_user_blocked" }, { status: 403 });
    throw error;
  }
  if (decision.kind === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const requesterUserId = decision.requesterUserId;
  after(async () => {
    try {
      const room = await roomTitleAndMembers(conversationId);
      await notifyConversationMessage(room.sessionKey, [...room.memberUserIds, requesterUserId], undefined, { timeoutMs: 3000 });
      if (decision.kind === "accepted") {
        await sendPushNotificationForConversationJoinRequest({
          kind: "accepted", channelId: conversationId, requestId, requesterUserId, recipientUserIds: [requesterUserId], roomTitle: room.title,
        });
      }
    } catch (error) {
      console.error("[conversations] join_decision_notify_failed", error instanceof Error ? error.name : "unknown");
    }
  });
  return NextResponse.json({ ok: true, accepted: decision.kind === "accepted" });
}
