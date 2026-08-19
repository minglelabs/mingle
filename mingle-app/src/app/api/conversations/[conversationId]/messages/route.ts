import { type NextRequest } from "next/server";
import {
  conversationFailureResponse,
  conversationJson,
  normalizeRouteId,
  requireSessionUserId,
  unauthorizedResponse,
} from "@/server/api/conversation-route-helpers";
import {
  CONVERSATION_MESSAGE_TEXT_MAX_LENGTH,
  listConversationMessages,
  listConversationParticipants,
  markConversationRead,
  sendConversationMessage,
} from "@/server/conversation-messages";

export const runtime = "nodejs";

type MessagesRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export async function GET(request: NextRequest, { params }: MessagesRouteProps) {
  const viewerId = await requireSessionUserId();
  if (!viewerId) return unauthorizedResponse();

  const conversationId = normalizeRouteId((await params).conversationId);
  if (!conversationId) {
    return conversationJson({ error: "invalid_conversation_id" }, { status: 400 });
  }

  const rawLimit = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : undefined;
  // Opt-in, because the thread is polled — see listConversationMessages.
  const backfillTranslations = request.nextUrl.searchParams.get("backfill") === "1";

  try {
    const [messages, participants] = await Promise.all([
      listConversationMessages({ conversationId, viewerId, limit, backfillTranslations }),
      listConversationParticipants(conversationId),
    ]);
    await markConversationRead({ conversationId, userId: viewerId });

    const others = participants.filter((participant) => participant.id !== viewerId);

    return conversationJson({
      messages,
      participants,
      // Deprecated aliases kept for the 1:1-era client; new code should use
      // `participants`, which supports rooms with more than two people.
      members: participants,
      partner: others[0] ?? null,
    });
  } catch (error) {
    return conversationFailureResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: MessagesRouteProps) {
  const senderId = await requireSessionUserId();
  if (!senderId) return unauthorizedResponse();

  const conversationId = normalizeRouteId((await params).conversationId);
  if (!conversationId) {
    return conversationJson({ error: "invalid_conversation_id" }, { status: 400 });
  }

  let body: { text?: unknown; clientMessageId?: unknown; sourceLanguage?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return conversationJson({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.text !== "string") {
    return conversationJson({ error: "invalid_text" }, { status: 400 });
  }
  if (body.text.trim().length > CONVERSATION_MESSAGE_TEXT_MAX_LENGTH) {
    return conversationJson({ error: "text_too_long" }, { status: 400 });
  }

  try {
    const message = await sendConversationMessage({
      conversationId,
      senderId,
      text: body.text,
      clientMessageId: typeof body.clientMessageId === "string" ? body.clientMessageId : null,
      sourceLanguage: typeof body.sourceLanguage === "string" ? body.sourceLanguage : null,
    });
    return conversationJson({ message }, { status: 201 });
  } catch (error) {
    return conversationFailureResponse(error);
  }
}
