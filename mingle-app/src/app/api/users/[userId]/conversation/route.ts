import { type NextRequest } from "next/server";
import { isSupportedLocale } from "@/i18n/config";
import {
  conversationFailureResponse,
  conversationJson,
  normalizeRouteId,
  requireSessionUserId,
  unauthorizedResponse,
} from "@/server/api/conversation-route-helpers";
import { getOrCreateDirectConversation } from "@/server/conversation-messages";

export const runtime = "nodejs";

type ConversationRouteProps = {
  params: Promise<{
    userId: string;
  }>;
};

export async function POST(request: NextRequest, { params }: ConversationRouteProps) {
  const viewerId = await requireSessionUserId();
  if (!viewerId) return unauthorizedResponse();

  const partnerId = normalizeRouteId((await params).userId);
  if (!partnerId) {
    return conversationJson({ error: "invalid_user_id" }, { status: 400 });
  }

  let locale = "en";
  try {
    const body = (await request.json()) as { locale?: unknown };
    if (typeof body?.locale === "string" && isSupportedLocale(body.locale.trim())) {
      locale = body.locale.trim();
    }
  } catch {
    // A body is optional here; the locale only affects the generated room title.
  }

  try {
    const conversation = await getOrCreateDirectConversation({ viewerId, partnerId, locale });
    return conversationJson({ conversation });
  } catch (error) {
    return conversationFailureResponse(error);
  }
}
