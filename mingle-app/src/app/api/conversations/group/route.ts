import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { isSupportedLocale } from "@/i18n/config";
import {
  ConversationMessageError,
  getOrCreateConversationWith,
} from "@/server/conversation-messages";

export const runtime = "nodejs";

const FAILURE_STATUS: Record<string, number> = {
  user_not_found: 404,
  user_blocked: 409,
  cannot_message_self: 400,
  conversation_not_found: 404,
  not_a_member: 403,
  no_participants: 400,
  too_many_participants: 400,
};

function getSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

/**
 * Opens (or creates) the room whose members are exactly the caller plus every
 * id in `participantIds`. With one id this behaves like the 1:1 shortcut at
 * POST /api/users/:userId/conversation; with more, it opens a group room.
 */
export async function POST(request: NextRequest) {
  const viewerId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!viewerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { participantIds?: unknown; locale?: unknown };
  try {
    body = (await request.json()) as { participantIds?: unknown; locale?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!Array.isArray(body.participantIds) || body.participantIds.some((id) => typeof id !== "string")) {
    return NextResponse.json({ error: "invalid_participant_ids" }, { status: 400 });
  }

  const locale = typeof body.locale === "string" && isSupportedLocale(body.locale.trim())
    ? body.locale.trim()
    : "en";

  try {
    const conversation = await getOrCreateConversationWith({
      viewerId,
      participantIds: body.participantIds as string[],
      locale,
    });
    return NextResponse.json({ conversation }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof ConversationMessageError) {
      return NextResponse.json(
        { error: error.reason },
        { status: FAILURE_STATUS[error.reason] ?? 400 },
      );
    }
    throw error;
  }
}
