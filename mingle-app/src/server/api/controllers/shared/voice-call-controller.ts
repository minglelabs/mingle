import { after, NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { getConversationSessionKeyForMember, listChannelMemberUserIdsBySessionKey } from "@/lib/app-conversations";
import { notifyConversationMessage } from "@/server/conversation-realtime";
import { sendPushNotificationForVoiceCallStarted } from "@/server/push-notifications";
import { resolveOrCreateUserIdForRequest } from "@/lib/request-user-identity";
import { prisma } from "@/lib/prisma";
import { listRoomIdentities, mintVoiceJoinToken, readLiveKitConfig, verifyLiveKitWebhook } from "@/server/voice/livekit-auth";
import { prismaVoiceStore } from "@/server/voice/prisma-voice-store";
import { VOICE_CALL_MESSAGE_TEXT, buildVoiceCallMessageClientId } from "@/lib/voice-call-message";
import {
  applyLiveKitWebhookEvent,
  getLiveCallView,
  joinVoiceCall,
  leaveVoiceCall,
  reconcileLiveCall,
  type LiveKitWebhookEvent,
  type VoiceStore,
  VoiceRoomFullError,
} from "@/server/voice/voice-calls";

export const runtime = "nodejs";

// Tests swap the store and the LiveKit lookup; production uses Prisma and LiveKit.
let store: VoiceStore = prismaVoiceStore;
let listIdentities: typeof listRoomIdentities = listRoomIdentities;
export function setVoiceStoreForTests(next: VoiceStore | null, lookup?: typeof listRoomIdentities) {
  store = next ?? prismaVoiceStore;
  listIdentities = lookup ?? listRoomIdentities;
}

type MemberCheck = { userId: string; sessionKey: string } | { response: NextResponse };

async function requireChannelMember(request: NextRequest, conversationId: string): Promise<MemberCheck> {
  const session = await getServerSession(getAuthOptions());
  const resolvedUser = await resolveOrCreateUserIdForRequest({ request, session });
  if (!resolvedUser.userId) {
    return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const sessionKey = await getConversationSessionKeyForMember({ conversationId, userId: resolvedUser.userId });
  if (!sessionKey) {
    return { response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { userId: resolvedUser.userId, sessionKey };
}

// The list shows which rooms have a live call: a join or leave refreshes the
// list of every member. A failure only delays that until the next refresh.
function refreshMemberLists(sessionKey: string) {
  after(async () => {
    try {
      const memberUserIds = await listChannelMemberUserIdsBySessionKey(sessionKey);
      await notifyConversationMessage("", memberUserIds, undefined, { timeoutMs: 3000 });
    } catch (error) {
      console.warn("[voice] list_refresh_failed", error instanceof Error ? error.name : "unknown");
    }
  });
}

// A call that starts leaves a message in the room ("<name> started a voice
// talk", with a Join button): members who were not looking see it when they
// open the room, and can join from it as long as the call is live. One per
// call: a retried start finds the message already there.
let announceCallStarted = async (input: { sessionKey: string; callId: string; starterUserId: string }) => {
  const clientMessageId = buildVoiceCallMessageClientId(input.callId);
  await prisma.appMessage.upsert({
    where: { sessionKey_clientMessageId: { sessionKey: input.sessionKey, clientMessageId } },
    update: {},
    create: {
      userId: input.starterUserId,
      sessionKey: input.sessionKey,
      clientMessageId,
      sourceLanguage: "en",
      metadata: { voiceCall: { callId: input.callId } },
      contents: { create: { contentType: "SOURCE", language: "en", text: VOICE_CALL_MESSAGE_TEXT } },
    },
  });
  // Open rooms load the new message; lists show it as the latest.
  const memberUserIds = await listChannelMemberUserIdsBySessionKey(input.sessionKey);
  await notifyConversationMessage(input.sessionKey, memberUserIds, undefined, { timeoutMs: 3000 });
};
export function setVoiceCallAnnouncerForTests(next: typeof announceCallStarted | null) {
  if (next) announceCallStarted = next;
}

// Reading the call also frees the seats of apps that were closed without
// leaving (LiveKit no longer has them), so a phone that only looks at the
// room sees who is really there. Every open room reads this every few
// seconds; LiveKit is asked at most once per interval per room.
const READ_RECONCILE_INTERVAL_MS = 5_000;
const lastReadReconcileAt = new Map<string, number>();
export function resetVoiceReadReconcileForTests() {
  lastReadReconcileAt.clear();
}

async function reconcileOnRead(conversationId: string) {
  const config = readLiveKitConfig();
  if (!config) return;
  const now = Date.now();
  if (now - (lastReadReconcileAt.get(conversationId) ?? 0) < READ_RECONCILE_INTERVAL_MS) return;
  lastReadReconcileAt.set(conversationId, now);
  if (lastReadReconcileAt.size > 2000) {
    for (const [key, at] of lastReadReconcileAt) {
      if (now - at > 60_000) lastReadReconcileAt.delete(key);
    }
  }
  await reconcileLiveCall(store, {
    channelId: conversationId,
    listIdentities: (room) => listIdentities(config, room),
  }).catch((error) => console.warn("[voice] read_reconcile_failed", error instanceof Error ? error.name : "unknown"));
}

export async function getVoiceCallResponse(request: NextRequest, conversationId: string) {
  const member = await requireChannelMember(request, conversationId);
  if ("response" in member) return member.response;
  await reconcileOnRead(conversationId);
  return NextResponse.json({ call: await getLiveCallView(store, conversationId) });
}

function readLang(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})?$/.test(trimmed) ? trimmed : null;
}

export async function postVoiceCallTokenResponse(request: NextRequest, conversationId: string) {
  const member = await requireChannelMember(request, conversationId);
  if ("response" in member) return member.response;

  let body: { lang?: unknown; interpret?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const lang = readLang(body.lang);
  if (!lang) return NextResponse.json({ error: "invalid_lang" }, { status: 400 });
  // The call carries the original voices only. Translated speech comes from
  // the room itself: each phone's STT posts room messages, and the room's
  // speaker / earphone mode reads them aloud. There is no interpreter bot,
  // so `interpret` from older apps is ignored.
  const interpretOn = false;

  const config = readLiveKitConfig();
  if (!config) return NextResponse.json({ error: "voice_unavailable" }, { status: 503 });

  // Free seats left by apps that dropped without saying goodbye.
  await reconcileLiveCall(store, {
    channelId: conversationId,
    listIdentities: (room) => listIdentities(config, room),
  }).catch((error) => console.warn("[voice] reconcile_failed", error));

  let joined;
  try {
    joined = await joinVoiceCall(store, { channelId: conversationId, userId: member.userId, lang, interpretOn });
  } catch (error) {
    if (error instanceof VoiceRoomFullError) {
      return NextResponse.json({ error: "voice_room_full" }, { status: 409 });
    }
    throw error;
  }
  const { created, ...call } = joined;

  refreshMemberLists(member.sessionKey);
  if (created) {
    // Everyone else in the room gets a voice talk push; tapping it opens the
    // room, where the panel offers Join or Decline.
    const sessionKey = member.sessionKey;
    const starterUserId = member.userId;
    after(async () => {
      try {
        await announceCallStarted({ sessionKey, callId: call.id, starterUserId });
      } catch (error) {
        console.error("[voice] start_message_failed", error instanceof Error ? error.name : "unknown");
      }
      try {
        const memberUserIds = await listChannelMemberUserIdsBySessionKey(sessionKey);
        await sendPushNotificationForVoiceCallStarted({ channelId: conversationId, callId: call.id, starterUserId, memberUserIds });
      } catch (error) {
        console.error("[voice] start_push_failed", error instanceof Error ? error.name : "unknown");
      }
    });
  }

  const self = call.participants.find((participant) => participant.userId === member.userId);
  const displayName = self?.name
    ?? (await prisma.user.findUnique({ where: { id: member.userId }, select: { name: true } }))?.name
    ?? "";

  const token = mintVoiceJoinToken({
    config,
    room: call.room,
    identity: member.userId,
    name: displayName,
    attributes: { lang, interpret: interpretOn ? "on" : "off", role: "speaker" },
  });

  return NextResponse.json({ url: config.url, token, room: call.room, identity: member.userId, call });
}

export async function postVoiceCallLeaveResponse(request: NextRequest, conversationId: string) {
  const member = await requireChannelMember(request, conversationId);
  if ("response" in member) return member.response;
  const result = await leaveVoiceCall(store, { channelId: conversationId, userId: member.userId });
  refreshMemberLists(member.sessionKey);
  return NextResponse.json({ ok: true, ended: result.ended });
}

export async function postLiveKitWebhookResponse(request: NextRequest) {
  const config = readLiveKitConfig();
  if (!config) return NextResponse.json({ error: "voice_unavailable" }, { status: 503 });

  const rawBody = await request.text();
  const authorization = request.headers.get("authorization");
  if (!verifyLiveKitWebhook({ config, rawBody, authorization })) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let event: LiveKitWebhookEvent;
  try {
    event = JSON.parse(rawBody) as LiveKitWebhookEvent;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await applyLiveKitWebhookEvent(store, event);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    // e.g. an identity that is not a user. Answer 200 so LiveKit does not
    // retry an event that will never apply; the log keeps it visible.
    console.error("[voice] webhook_apply_failed", event.event, error);
    return NextResponse.json({ ok: false, handled: false });
  }
}
