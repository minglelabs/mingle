import { NextRequest, NextResponse } from "next/server";
import {
  type ConversationHydrationCursor,
  getConversationHydrationStateForShare,
} from "@/lib/app-conversations";

export const runtime = "nodejs";

/** The intentionally small, public shape consumed by the spectate UI. */
function toPublicSpectateResponse(state: Awaited<ReturnType<typeof getConversationHydrationStateForShare>>) {
  if (!state) return null;

  return {
    conversation: { title: state.conversation.title },
    // The native overlay resolves the sharer's public profile from this ID.
    sharedByUserId: state.sharedByUserId,
    utterances: state.utterances.map((utterance, index) => ({
      // The viewer only needs a React key; do not expose database message IDs.
      id: `snapshot-message-${index}`,
      originalText: utterance.originalText,
      originalLang: utterance.originalLang,
      targetLanguages: utterance.targetLanguages,
      translations: utterance.translations,
      translationFinalized: utterance.translationFinalized,
      createdAtMs: utterance.createdAtMs,
      speaker: utterance.speaker,
      speakerAvatarSeed: utterance.speakerAvatarSeed,
      speakerAvatarIndex: utterance.speakerAvatarIndex,
      speakerName: utterance.speakerName,
      // ChatBubble uses this only to distinguish a shared-room speaker from
      // a solo-session diarized speaker. It is not a session credential.
      speakerUserId: utterance.speakerUserId,
      speakerImage: utterance.speakerImage,
    })),
  };
}

// Public read-only response. The lookup requires an enabled share token and
// the response above excludes the member-only channel identity and notices.

function readConversationHydrationCursor(
  request: NextRequest,
): { cursor: ConversationHydrationCursor | null; errorResponse: NextResponse | null } {
  const beforeCreatedAtMsRaw = request.nextUrl.searchParams.get("beforeCreatedAtMs");
  const beforeMessageIdRaw = request.nextUrl.searchParams.get("beforeMessageId");

  if (!beforeCreatedAtMsRaw && !beforeMessageIdRaw) {
    return { cursor: null, errorResponse: null };
  }

  const beforeCreatedAtMs = Number(beforeCreatedAtMsRaw);
  const beforeMessageId = (beforeMessageIdRaw || "").trim();
  if (!Number.isFinite(beforeCreatedAtMs) || beforeCreatedAtMs <= 0 || !beforeMessageId) {
    return {
      cursor: null,
      errorResponse: NextResponse.json({ error: "invalid_cursor" }, { status: 400 }),
    };
  }

  return {
    cursor: { createdAtMs: beforeCreatedAtMs, messageId: beforeMessageId },
    errorResponse: null,
  };
}

export async function getConversationSpectateStateResponse(
  request: NextRequest,
  shareToken: string,
) {
  const { cursor, errorResponse } = readConversationHydrationCursor(request);
  if (errorResponse) {
    return errorResponse;
  }

  const state = await getConversationHydrationStateForShare({
    shareToken,
    ...(cursor ? { before: cursor } : {}),
  });

  const publicState = toPublicSpectateResponse(state);
  if (!publicState) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(publicState);
}
