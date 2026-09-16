import { NextRequest, NextResponse } from "next/server";
import {
  type ConversationHydrationCursor,
  getConversationHydrationStateForShare,
} from "@/lib/app-conversations";

export const runtime = "nodejs";

// Fully public: no getServerSession/auth import anywhere in this file. Gates
// on the room's shareToken existing (no on/off state) instead of a session,
// so a viewer never needs a Mingle account. Returns a fixed snapshot —
// messages up to the share's sharedAt cutoff — not a live feed, so this is
// a plain single fetch with no realtime channel to mint a token for.

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
