import { NextRequest, NextResponse } from "next/server";
import {
  type ConversationHydrationCursor,
  getConversationHydrationStateForShare,
} from "@/lib/app-conversations";
import {
  type PublicSpectateInviter,
  toPublicSpectateSnapshot,
} from "@/lib/conversation-share-public-payload";
import { getUserProfile } from "@/server/user-profile";

export const runtime = "nodejs";

// The sharer's public profile card, resolved here so the response can carry
// who shared the room without carrying their account id — see
// conversation-share-public-payload for why no internal id may leak into a
// payload anyone with the link can read.
async function resolvePublicInviter(
  sharedByUserId: string | null,
): Promise<PublicSpectateInviter | null> {
  if (!sharedByUserId) return null;

  const profile = await getUserProfile(sharedByUserId);
  if (!profile) return null;

  return {
    name: profile.name,
    image: profile.image,
    imageCropScale: profile.imageCropScale,
    imageCropX: profile.imageCropX,
    imageCropY: profile.imageCropY,
  };
}

// Public response: the lookup requires an enabled share token, and the
// serializer above excludes the member-only channel identity and notices as
// well as every internal id.

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

  const publicState = toPublicSpectateSnapshot(
    state,
    await resolvePublicInviter(state.sharedByUserId),
  );

  return NextResponse.json(publicState);
}
