import { NextRequest, NextResponse } from "next/server";
import {
  type ConversationHydrationCursor,
  getConversationHydrationStateForShare,
  getConversationSessionKeyForShare,
} from "@/lib/app-conversations";
import { mintConversationRealtimeToken } from "@/server/conversation-realtime";

export const runtime = "nodejs";

// Fully public: no getServerSession/auth import anywhere in this file. Every
// entry point below gates on the room's live shareToken + shareEnabled
// state instead of a session, so a viewer never needs a Mingle account, and
// turning sharing off blocks the very next request.

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

  if (!state) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(state);
}

// Mints the token a spectator hands mingle-messaging to open a read-only push
// channel for this room. mingle-messaging's WebSocket connection is
// subscribe-only by construction (publish only happens over a separate
// server-to-server secret-authed call) — there's no "send" capability to
// strip from this token, so it's minted the same way a member's is, just
// keyed to a synthetic spectator id instead of a real userId.
export async function getConversationSpectateRealtimeTokenResponse(
  shareToken: string,
) {
  const sessionKey = await getConversationSessionKeyForShare({ shareToken });
  if (!sessionKey) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const token = mintConversationRealtimeToken({ sessionKey, userId: `spectator:${shareToken}` });
  // Realtime push is unconfigured in this environment — not an error the
  // caller needs to see, since the client falls back to polling the state
  // endpoint above.
  return NextResponse.json({ token });
}
