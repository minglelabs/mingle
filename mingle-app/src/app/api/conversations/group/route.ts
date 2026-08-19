import { type NextRequest } from "next/server";
import { isSupportedLocale } from "@/i18n/config";
import {
  conversationFailureResponse,
  conversationJson,
  requireSessionUserId,
  unauthorizedResponse,
} from "@/server/api/conversation-route-helpers";
import { getOrCreateConversationWith } from "@/server/conversation-messages";

export const runtime = "nodejs";

/**
 * Opens (or creates) the room whose members are exactly the caller plus every
 * id in `participantIds`. With one id this behaves like the 1:1 shortcut at
 * POST /api/users/:userId/conversation; with more, it opens a group room.
 */
export async function POST(request: NextRequest) {
  const viewerId = await requireSessionUserId();
  if (!viewerId) return unauthorizedResponse();

  let body: { participantIds?: unknown; locale?: unknown };
  try {
    body = (await request.json()) as { participantIds?: unknown; locale?: unknown };
  } catch {
    return conversationJson({ error: "invalid_json" }, { status: 400 });
  }

  if (!Array.isArray(body.participantIds) || body.participantIds.some((id) => typeof id !== "string")) {
    return conversationJson({ error: "invalid_participant_ids" }, { status: 400 });
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
    return conversationJson({ conversation });
  } catch (error) {
    return conversationFailureResponse(error);
  }
}
