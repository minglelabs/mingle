import { after, NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import {
  createOpenRoom,
  findOpenRoomForReport,
  getOpenRoomInfo,
  updateOpenRoomSettings,
  decideConversationJoinRequest,
  findConversationByRoomCode,
  joinOrRequestByRoomCode,
  joinPublicConversationChannel,
  listConversationJoinRequests,
  listChannelMemberUserIdsBySessionKey,
  listLiveRooms,
  listOpenRooms,
  setConversationPublic,
} from "@/lib/app-conversations";
import { resolveOrCreateUserIdForRequest } from "@/lib/request-user-identity";
import { notifyConversationMessage } from "@/server/conversation-realtime";
import { sendPushNotificationForConversationJoinRequest } from "@/server/push-notifications";
import { parseRoomCode } from "@/lib/room-code";
import { normalizeOpenRoomTitle, normalizeOpenRoomTopic, readOpenRoomPassword } from "@/lib/open-room";
import { prisma } from "@/lib/prisma";
import { createReport, normalizeReportMessage, normalizeReportReason } from "@/server/reports/report-service";
import { getVoiceLounge } from "@/server/voice-lounge";

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

/** The answer for a missing or wrong open-room password, or null when the error is something else. */
function passwordErrorResponse(error: unknown): NextResponse | null {
  const code = error instanceof Error ? error.message : "";
  if (code === "password_required" || code === "password_wrong") return NextResponse.json({ error: code }, { status: 403 });
  if (code === "password_locked") return NextResponse.json({ error: code }, { status: 429 });
  return null;
}

async function readPasswordFromBody(request: NextRequest): Promise<string | null> {
  const body = await request.json().catch(() => null) as { password?: unknown } | null;
  return typeof body?.password === "string" && body.password ? body.password : null;
}

/** GET ?q= — every public room for the Explore tab, the viewer's own first. */
export async function getOpenRoomsResponse(request: NextRequest) {
  const userId = await resolveUserId(request).catch(() => "");
  const query = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  // `kind=voice`: the voice rooms of the voice-room tab; otherwise the open chat rooms of Explore.
  const rooms = await listOpenRooms(userId || null, { query, voiceRooms: request.nextUrl.searchParams.get("kind") === "voice" });
  // A woman may make a women-only room: the sheet shows that choice to her only.
  const canMakeWomenOnly = userId ? await isWoman(userId) : false;
  return NextResponse.json({ rooms, canMakeWomenOnly }, { headers: { "cache-control": "no-store" } });
}

async function isWoman(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { gender: true } }).catch(() => null);
  return user?.gender === "female";
}

/** GET — the voice tab's always-open lounge, as an open-room card (null when it cannot be made). */
export async function getVoiceLoungeResponse(request: NextRequest) {
  const userId = await resolveUserId(request).catch(() => "");
  const lounge = await getVoiceLounge(userId || null).catch((error) => {
    console.error("[voice-rooms] lounge_failed", error instanceof Error ? error.message : "unknown");
    return null;
  });
  return NextResponse.json({ lounge }, { headers: { "cache-control": "no-store" } });
}

/** POST { title, topic?, password?, locale?, voiceRoom? } — make an open room from Explore, or a voice room from the voice-room tab. */
export async function postOpenRoomResponse(request: NextRequest) {
  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { title?: unknown; topic?: unknown; password?: unknown; locale?: unknown; voiceRoom?: unknown; womenOnly?: unknown } | null;
  if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  const title = normalizeOpenRoomTitle(body.title);
  if (!title) return NextResponse.json({ error: "invalid_title" }, { status: 400 });
  const password = readOpenRoomPassword(body.password);
  if (password.kind === "invalid") return NextResponse.json({ error: "invalid_password" }, { status: 400 });
  const conversation = await createOpenRoom({
    userId,
    locale: typeof body.locale === "string" ? body.locale : undefined,
    title,
    topic: normalizeOpenRoomTopic(body.topic),
    password: password.kind === "ok" ? password.password : null,
    voiceRoom: body.voiceRoom === true,
    // Only a woman makes a women-only room; from anyone else the choice is dropped.
    womenOnly: body.womenOnly === true && (await isWoman(userId)),
  });
  return NextResponse.json({ conversation }, { status: 201 });
}

/** GET — the open-room facts a member sees in the room menu (topic, lock, whether they are the host). */
export async function getOpenRoomInfoResponse(request: NextRequest, conversationId: string) {
  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const room = await getOpenRoomInfo({ conversationId, userId });
  if (!room) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ room }, { headers: { "cache-control": "no-store" } });
}

/** PATCH { topic?, password? } — the host changes the topic or the password ("" or null clears it). */
export async function patchOpenRoomSettingsResponse(request: NextRequest, conversationId: string) {
  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { topic?: unknown; password?: unknown } | null;
  if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  const password = body.password === undefined ? undefined : readOpenRoomPassword(body.password);
  if (password?.kind === "invalid") return NextResponse.json({ error: "invalid_password" }, { status: 400 });
  const room = await updateOpenRoomSettings({
    conversationId,
    userId,
    topic: body.topic === undefined ? undefined : normalizeOpenRoomTopic(body.topic),
    password: password === undefined ? undefined : password.kind === "ok" ? password.password : null,
  });
  if (!room) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ room });
}

/** POST { reason, message? } — report an open room. The report is filed on its host. */
export async function postOpenRoomReportResponse(request: NextRequest, conversationId: string) {
  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { reason?: unknown; message?: unknown } | null;
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const reason = normalizeReportReason(body.reason);
  if (!reason) return NextResponse.json({ error: "invalid_reason" }, { status: 400 });
  const message = normalizeReportMessage(body.message);
  if (!message.ok) return NextResponse.json({ error: "invalid_message" }, { status: 400 });
  const room = await findOpenRoomForReport(conversationId);
  if (!room) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (room.hostUserId === userId) return NextResponse.json({ error: "cannot_report_own_content" }, { status: 400 });
  const result = await createReport(prisma, {
    reporterId: userId,
    reportedUserId: room.hostUserId,
    targetType: "room",
    targetRoomId: room.id,
    reason,
    message: message.message,
  });
  if (result.status === "duplicate") return NextResponse.json({ status: "already_reported", duplicate: true });
  return NextResponse.json({ reportId: result.reportId, status: result.reportStatus }, { status: 201 });
}

/** POST { password? } — join a public room from the Explore tab. */
export async function postPublicRoomJoinResponse(request: NextRequest, conversationId: string) {
  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const password = await readPasswordFromBody(request);
  let conversation;
  try {
    conversation = await joinPublicConversationChannel({ conversationId, userId, password });
  } catch (error) {
    const passwordError = passwordErrorResponse(error);
    if (passwordError) return passwordError;
    const code = error instanceof Error ? error.message : "";
    if (code === "room_full") return NextResponse.json({ error: "room_full" }, { status: 400 });
    if (code === "women_only") return NextResponse.json({ error: "women_only" }, { status: 403 });
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
  const password = await readPasswordFromBody(request);
  let result;
  try {
    result = await joinOrRequestByRoomCode(code, userId, password);
  } catch (error) {
    const passwordError = passwordErrorResponse(error);
    if (passwordError) return passwordError;
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
