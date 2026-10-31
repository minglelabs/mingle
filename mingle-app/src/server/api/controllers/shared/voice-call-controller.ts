import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { getConversationSessionKeyForMember } from "@/lib/app-conversations";
import { resolveOrCreateUserIdForRequest } from "@/lib/request-user-identity";
import { prisma } from "@/lib/prisma";
import { listRoomIdentities, mintVoiceJoinToken, readLiveKitConfig, verifyLiveKitWebhook } from "@/server/voice/livekit-auth";
import { prismaVoiceStore } from "@/server/voice/prisma-voice-store";
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

type MemberCheck = { userId: string } | { response: NextResponse };

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
  return { userId: resolvedUser.userId };
}

export async function getVoiceCallResponse(request: NextRequest, conversationId: string) {
  const member = await requireChannelMember(request, conversationId);
  if ("response" in member) return member.response;
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
  const interpretOn = body.interpret !== false;

  const config = readLiveKitConfig();
  if (!config) return NextResponse.json({ error: "voice_unavailable" }, { status: 503 });

  // Free seats left by apps that dropped without saying goodbye.
  await reconcileLiveCall(store, {
    channelId: conversationId,
    listIdentities: (room) => listIdentities(config, room),
  }).catch((error) => console.warn("[voice] reconcile_failed", error));

  let call;
  try {
    call = await joinVoiceCall(store, { channelId: conversationId, userId: member.userId, lang, interpretOn });
  } catch (error) {
    if (error instanceof VoiceRoomFullError) {
      return NextResponse.json({ error: "voice_room_full" }, { status: 409 });
    }
    throw error;
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
