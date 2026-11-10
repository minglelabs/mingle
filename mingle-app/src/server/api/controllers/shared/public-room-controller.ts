import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import {
  joinPublicConversationChannel,
  listChannelMemberUserIdsBySessionKey,
  listLiveRooms,
  setConversationPublic,
} from "@/lib/app-conversations";
import { resolveOrCreateUserIdForRequest } from "@/lib/request-user-identity";
import { notifyConversationMessage } from "@/server/conversation-realtime";

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
