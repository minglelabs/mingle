// The stage of an open room's call. The host and whoever starts the call
// speak; everyone else comes in as a listener (see joinVoiceCall's `stage`).
// A listener raises a hand; the host puts people on the stage and takes them
// off it. Pure logic over the VoiceStore, like voice-calls.ts.

import {
  participantRole,
  toCallView,
  voiceStageSeats,
  type VoiceCallView,
  type VoiceRole,
  type VoiceStore,
} from "@/server/voice/voice-calls";

export type VoiceStageAction =
  /** A listener asks for the stage. */
  | "raise"
  /** A listener takes the request back. */
  | "lower"
  /** The host puts a listener on the stage. */
  | "invite"
  /** The host takes a speaker off the stage. */
  | "remove"
  /** A speaker steps off the stage. */
  | "step_down";

export const VOICE_STAGE_ACTIONS: readonly VoiceStageAction[] = ["raise", "lower", "invite", "remove", "step_down"];

export function isVoiceStageAction(value: unknown): value is VoiceStageAction {
  return typeof value === "string" && (VOICE_STAGE_ACTIONS as readonly string[]).includes(value);
}

export type VoiceStageResult =
  | { ok: true; call: VoiceCallView; /** Whose right to talk changed, for the media server. */ changed: { userId: string; role: VoiceRole } | null }
  | { ok: false; error: "no_call" | "not_in_call" | "forbidden" | "stage_full" | "invalid_target" };

export async function changeVoiceStage(
  store: VoiceStore,
  input: {
    channelId: string;
    actorUserId: string;
    /** The room's host. */
    hostUserId: string;
    action: VoiceStageAction;
    /** For invite and remove. */
    targetUserId?: string | null;
    now?: Date;
  },
): Promise<VoiceStageResult> {
  const now = input.now ?? new Date();
  return store.withChannelLock(input.channelId, async (tx): Promise<VoiceStageResult> => {
    const call = await tx.findLiveCall(input.channelId);
    if (!call) return { ok: false, error: "no_call" };
    const active = await tx.listActiveParticipants(call.id);
    const actor = active.find((participant) => participant.userId === input.actorUserId);
    if (!actor) return { ok: false, error: "not_in_call" };
    const isHost = input.actorUserId === input.hostUserId;
    const done = async (changed: { userId: string; role: VoiceRole } | null): Promise<VoiceStageResult> => ({
      ok: true,
      call: toCallView(call, await tx.listActiveParticipants(call.id)),
      changed,
    });

    if (input.action === "raise" || input.action === "lower") {
      if (participantRole(actor) !== "listener") return done(null);
      await tx.updateParticipantStage({ callId: call.id, userId: actor.userId, handRaisedAt: input.action === "raise" ? now : null });
      return done(null);
    }

    if (input.action === "step_down") {
      if (participantRole(actor) !== "speaker") return done(null);
      await tx.updateParticipantStage({ callId: call.id, userId: actor.userId, role: "listener", handRaisedAt: null });
      return done({ userId: actor.userId, role: "listener" });
    }

    // invite / remove: the host only, on someone else in the call.
    if (!isHost) return { ok: false, error: "forbidden" };
    const target = active.find((participant) => participant.userId === input.targetUserId);
    if (!target || target.userId === input.actorUserId) return { ok: false, error: "invalid_target" };

    if (input.action === "invite") {
      if (participantRole(target) === "speaker") return done(null);
      const speakers = active.filter((participant) => participantRole(participant) === "speaker").length;
      if (speakers >= voiceStageSeats(call)) return { ok: false, error: "stage_full" };
      await tx.updateParticipantStage({ callId: call.id, userId: target.userId, role: "speaker", handRaisedAt: null });
      return done({ userId: target.userId, role: "speaker" });
    }

    if (participantRole(target) === "listener") return done(null);
    await tx.updateParticipantStage({ callId: call.id, userId: target.userId, role: "listener", handRaisedAt: null });
    return done({ userId: target.userId, role: "listener" });
  });
}
