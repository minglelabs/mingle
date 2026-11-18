import { prisma } from "@/lib/prisma";
import { listRoomIdentities, readLiveKitConfig, type LiveKitConfig } from "@/server/voice/livekit-auth";
import { prismaVoiceStore } from "@/server/voice/prisma-voice-store";
import { reconcileLiveCall, type VoiceStore } from "@/server/voice/voice-calls";

// A seat stays taken when an app drops without leaving (killed, lost network,
// or a token issued and then LiveKit could not be reached). The room's own
// panel frees such seats when it is read, but the conversation list and the
// live-room search only count rows, so a dropped phone showed there as still
// in the call. They call this first: each room with a live call is checked
// against LiveKit at most once per interval, and a slow LiveKit never holds
// the list up for long.
export const LISTED_CALL_RECONCILE_INTERVAL_MS = 15_000;
export const LISTED_CALL_RECONCILE_BUDGET_MS = 3_000;

type Deps = {
  store: VoiceStore;
  readConfig: () => LiveKitConfig | null;
  listIdentities: (config: LiveKitConfig, room: string) => Promise<string[] | null>;
  findLiveCallChannelIds: (channelIds: string[] | null) => Promise<string[]>;
  /** A room's call changed (seats freed or the call ended): its members' lists refresh. */
  onCallChanged: (channelId: string) => Promise<void>;
  now: () => number;
};

const defaultDeps: Deps = {
  store: prismaVoiceStore,
  readConfig: () => readLiveKitConfig(),
  listIdentities: (config, room) => listRoomIdentities(config, room),
  findLiveCallChannelIds: async (channelIds) => {
    const calls = await prisma.appVoiceCall.findMany({
      where: { status: "live", ...(channelIds ? { channelId: { in: channelIds } } : {}) },
      select: { channelId: true },
    });
    return calls.map((call) => call.channelId);
  },
  onCallChanged: async (channelId) => {
    const channel = await prisma.appConversationChannel.findUnique({ where: { id: channelId }, select: { sessionKey: true } });
    if (!channel?.sessionKey) return;
    // Imported here: app-conversations imports this module.
    const { listChannelMemberUserIdsBySessionKey } = await import("@/lib/app-conversations");
    const { notifyConversationMessage } = await import("@/server/conversation-realtime");
    const memberUserIds = await listChannelMemberUserIdsBySessionKey(channel.sessionKey);
    await notifyConversationMessage("", memberUserIds, undefined, { timeoutMs: 3000 });
  },
  now: () => Date.now(),
};

let deps: Deps = defaultDeps;
const lastCheckedAt = new Map<string, number>();

export function setListedCallReconcileDepsForTests(next: Partial<Deps> | null) {
  deps = next ? { ...defaultDeps, ...next } : defaultDeps;
  lastCheckedAt.clear();
}

/** `channelIds` null = every room with a live call (the live-room search). */
export async function reconcileListedLiveCalls(channelIds: string[] | null): Promise<void> {
  if (channelIds && channelIds.length === 0) return;
  const config = deps.readConfig();
  if (!config) return;
  let liveChannelIds: string[];
  try {
    liveChannelIds = await deps.findLiveCallChannelIds(channelIds);
  } catch {
    return;
  }
  const now = deps.now();
  const due = liveChannelIds.filter((id) => now - (lastCheckedAt.get(id) ?? 0) >= LISTED_CALL_RECONCILE_INTERVAL_MS);
  if (due.length === 0) return;
  for (const id of due) lastCheckedAt.set(id, now);
  if (lastCheckedAt.size > 2000) {
    for (const [key, at] of lastCheckedAt) {
      if (now - at > 60_000) lastCheckedAt.delete(key);
    }
  }
  const work = Promise.all(due.map((channelId) =>
    reconcileLiveCall(deps.store, {
      channelId,
      listIdentities: (room) => deps.listIdentities(config, room),
    }).then((result) => {
      // The other members' lists still show the old count: tell them.
      if (result.dropped.length > 0) void deps.onCallChanged(channelId).catch(() => undefined);
    }).catch((error) => console.warn("[voice] list_reconcile_failed", error instanceof Error ? error.name : "unknown")),
  ));
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([work, new Promise<void>((resolve) => { timer = setTimeout(resolve, LISTED_CALL_RECONCILE_BUDGET_MS); })]);
  if (timer) clearTimeout(timer);
}
