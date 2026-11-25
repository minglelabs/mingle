import { prisma } from "@/lib/prisma";
import { createDuoCallChannel } from "@/lib/app-conversations";
import { resolveNationalityCountry } from "@/lib/nationality";
import { POST_CALL_RING_MS, isPostCallOver, type PostCallStatus, type PostCallView } from "@/lib/post-call";
import { isNewRoomBlockedForMen } from "@/server/male-dm-block";
import { visibleSinglePostWhere } from "@/server/posts/post-visibility";
import { sendPushNotificationForVoiceCallStarted } from "@/server/push-notifications";
import { calculateProfileAge } from "@/server/user-profile";

/**
 * 1:1 voice talk from a post (owner, 2026-11-25). A "call" post (see
 * @/lib/post-category) has a call button. Pressing it rings the author for
 * 30 seconds; when they answer, the two talk on a call screen of their own.
 *
 * It is neither a voice room nor a chat: no list shows it. Underneath, the
 * call runs on the room voice talk already built (LiveKit, interpretation,
 * captions), in a hidden two-person room made for this one call
 * (AppConversationChannel.isDuoCall).
 *
 * Rules:
 * - One call at a time for each person: an author who is ringing or talking
 *   is busy, and so is the caller.
 * - A woman's "no chats from men" switch holds here too (a man she follows
 *   may still call).
 * - Nothing runs in the background: a call's state is settled when someone
 *   reads it. A ring nobody answered in time is "missed"; an answered call
 *   with fewer than two people left in it is "ended".
 */

/** After answering, both phones get this long to be in the call before "fewer than two" means it ended. */
const JOIN_GRACE_MS = 20_000;
/** A ring is read as missed a little after the caller's countdown ends. */
const RING_SLACK_MS = 3_000;
/** After a call that was not answered, the same caller waits before ringing the same author again. */
const RETRY_COOLDOWN_MS = 60_000;

type CallRow = {
  id: string;
  postId: string;
  callerId: string;
  authorId: string;
  channelId: string;
  status: string;
  createdAt: Date;
  answeredAt: Date | null;
};

const CALL_SELECT = { id: true, postId: true, callerId: true, authorId: true, channelId: true, status: true, createdAt: true, answeredAt: true } as const;

async function peopleInVoice(channelId: string): Promise<number> {
  const live = await prisma.appVoiceCall.findFirst({
    where: { channelId, status: "live" },
    select: { _count: { select: { participants: { where: { leftAt: null } } } } },
  });
  return live?._count.participants ?? 0;
}

/** The call as it really is now: a ring that ran out is missed, an emptied call is ended. */
async function settle(call: CallRow, now: Date = new Date()): Promise<CallRow> {
  let next: PostCallStatus | null = null;
  if (call.status === "ringing" && now.getTime() - call.createdAt.getTime() > POST_CALL_RING_MS + RING_SLACK_MS) {
    next = "missed";
  } else if (call.status === "accepted" && call.answeredAt && now.getTime() - call.answeredAt.getTime() > JOIN_GRACE_MS) {
    if ((await peopleInVoice(call.channelId)) < 2) next = "ended";
  }
  if (!next) return call;
  // Only from the state it was read in: an answer that came in meanwhile wins.
  await prisma.postCall.updateMany({ where: { id: call.id, status: call.status }, data: { status: next, endedAt: now } });
  return { ...call, status: next };
}

/** Whether this person is ringing, being rung or talking right now. */
async function isBusy(userId: string): Promise<boolean> {
  const open = await prisma.postCall.findMany({
    where: { status: { in: ["ringing", "accepted"] }, OR: [{ callerId: userId }, { authorId: userId }] },
    select: CALL_SELECT,
  });
  for (const call of open) {
    if (!isPostCallOver((await settle(call)).status)) return true;
  }
  return false;
}

async function toView(call: CallRow, viewerId: string): Promise<PostCallView> {
  const role = call.authorId === viewerId ? "author" : "caller";
  const peerId = role === "author" ? call.callerId : call.authorId;
  const peer = await prisma.user.findUnique({
    where: { id: peerId },
    select: { id: true, name: true, handle: true, image: true, nationalityCountry: true, primaryLanguages: true, birthDate: true },
  });
  return {
    id: call.id,
    status: call.status as PostCallStatus,
    role,
    conversationId: call.channelId,
    ringEndsAt: new Date(call.createdAt.getTime() + POST_CALL_RING_MS).toISOString(),
    peer: {
      userId: peerId,
      name: peer?.name?.trim() || (peer?.handle ? `@${peer.handle}` : ""),
      image: peer?.image ?? null,
      country: peer ? resolveNationalityCountry(peer.nationalityCountry, peer.primaryLanguages) ?? null : null,
      age: peer ? calculateProfileAge(peer.birthDate) ?? null : null,
      language: peer?.primaryLanguages?.[0] ?? null,
    },
  };
}

export type StartPostCallError = "not_found" | "own_post" | "blocked" | "busy" | "caller_busy" | "too_soon";

/** The caller presses the call button of a call post: the author is rung. */
export async function startPostCall(args: { postId: string; callerId: string; locale?: string }): Promise<{ ok: true; call: PostCallView } | { ok: false; error: StartPostCallError }> {
  const post = await prisma.post.findFirst({
    where: { ...visibleSinglePostWhere(args.postId, args.callerId), category: "call" },
    select: { id: true, authorId: true },
  });
  if (!post) return { ok: false, error: "not_found" };
  if (post.authorId === args.callerId) return { ok: false, error: "own_post" };
  if (await isNewRoomBlockedForMen(args.callerId, post.authorId)) return { ok: false, error: "blocked" };
  if (await isBusy(args.callerId)) return { ok: false, error: "caller_busy" };
  if (await isBusy(post.authorId)) return { ok: false, error: "busy" };
  const recent = await prisma.postCall.findFirst({
    where: {
      callerId: args.callerId,
      authorId: post.authorId,
      status: { in: ["declined", "missed", "cancelled"] },
      createdAt: { gt: new Date(Date.now() - RETRY_COOLDOWN_MS) },
    },
    select: { id: true },
  });
  if (recent) return { ok: false, error: "too_soon" };

  let channel: { id: string; sessionKey: string };
  try {
    channel = await createDuoCallChannel({ callerId: args.callerId, authorId: post.authorId, locale: args.locale });
  } catch {
    // One of the two blocked the other (the room refuses to be made).
    return { ok: false, error: "blocked" };
  }
  const call = await prisma.postCall.create({
    data: { postId: post.id, callerId: args.callerId, authorId: post.authorId, channelId: channel.id },
    select: CALL_SELECT,
  });
  // The author's phone rings even with the app closed; a tap opens the call.
  void sendPushNotificationForVoiceCallStarted({
    channelId: channel.id,
    callId: call.id,
    starterUserId: args.callerId,
    memberUserIds: [post.authorId],
  }).catch((error) => console.error("[post-call] ring_push_failed", error instanceof Error ? error.name : "unknown"));
  return { ok: true, call: await toView(call, args.callerId) };
}

/** The call of this hidden room, for one of its two people (the call screen reads it). */
export async function getPostCallForRoom(conversationId: string, viewerId: string): Promise<PostCallView | null> {
  const call = await prisma.postCall.findFirst({
    where: { channelId: conversationId, OR: [{ callerId: viewerId }, { authorId: viewerId }] },
    orderBy: { createdAt: "desc" },
    select: CALL_SELECT,
  });
  return call ? toView(await settle(call), viewerId) : null;
}

/**
 * What the app asks while it is open: the call ringing this person now (if
 * any), and whether to keep asking often (`listening`: they have a call post
 * up, so a call may come at any moment).
 */
export async function getIncomingPostCall(userId: string): Promise<{ listening: boolean; call: PostCallView | null }> {
  const [ringing, posts] = await Promise.all([
    prisma.postCall.findFirst({ where: { authorId: userId, status: "ringing" }, orderBy: { createdAt: "desc" }, select: CALL_SELECT }),
    prisma.post.count({
      where: { authorId: userId, category: "call", expiresAt: { gt: new Date() }, OR: [{ isDeleted: null }, { isDeleted: false }] },
    }),
  ]);
  const settled = ringing ? await settle(ringing) : null;
  return {
    listening: posts > 0,
    call: settled && settled.status === "ringing" ? await toView(settled, userId) : null,
  };
}

export type PostCallAction = "accept" | "hangup";
export function isPostCallAction(value: unknown): value is PostCallAction {
  return value === "accept" || value === "hangup";
}

/**
 * `accept`: the author answers a ring. `hangup`: whatever ends it from this
 * side (the caller gives up waiting, the author declines, either one ends
 * the talk).
 */
export async function actOnPostCall(args: { callId: string; userId: string; action: PostCallAction }): Promise<{ ok: true; call: PostCallView } | { ok: false; error: "not_found" | "forbidden" | "over" }> {
  const found = await prisma.postCall.findUnique({ where: { id: args.callId }, select: CALL_SELECT });
  if (!found || (found.callerId !== args.userId && found.authorId !== args.userId)) return { ok: false, error: "not_found" };
  const call = await settle(found);
  const now = new Date();
  if (args.action === "accept") {
    if (call.authorId !== args.userId) return { ok: false, error: "forbidden" };
    if (call.status === "accepted") return { ok: true, call: await toView(call, args.userId) };
    if (call.status !== "ringing") return { ok: false, error: "over" };
    const changed = await prisma.postCall.updateMany({ where: { id: call.id, status: "ringing" }, data: { status: "accepted", answeredAt: now } });
    if (changed.count === 0) return { ok: false, error: "over" };
    return { ok: true, call: await toView({ ...call, status: "accepted", answeredAt: now }, args.userId) };
  }
  if (isPostCallOver(call.status)) return { ok: true, call: await toView(call, args.userId) };
  const next: PostCallStatus = call.status === "accepted" ? "ended" : call.authorId === args.userId ? "declined" : "cancelled";
  await prisma.postCall.updateMany({ where: { id: call.id, status: call.status }, data: { status: next, endedAt: now } });
  return { ok: true, call: await toView({ ...call, status: next }, args.userId) };
}
