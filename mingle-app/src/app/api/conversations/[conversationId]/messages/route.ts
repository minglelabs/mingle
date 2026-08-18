import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import {
  CONVERSATION_MESSAGE_TEXT_MAX_LENGTH,
  ConversationMessageError,
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

const FAILURE_STATUS: Record<string, number> = {
  not_a_member: 403,
  conversation_not_found: 404,
  user_not_found: 404,
  user_blocked: 409,
  cannot_message_self: 400,
  no_participants: 400,
  too_many_participants: 400,
  empty_text: 400,
};

function getSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

function responseJson(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...init?.headers,
    },
  });
}

function failureResponse(error: unknown): NextResponse {
  if (error instanceof ConversationMessageError) {
    return responseJson(
      { error: error.reason },
      { status: FAILURE_STATUS[error.reason] ?? 400 },
    );
  }
  throw error;
}

export async function GET(request: NextRequest, { params }: MessagesRouteProps) {
  const viewerId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!viewerId) return responseJson({ error: "unauthorized" }, { status: 401 });

  const { conversationId } = await params;
  const normalizedId = conversationId.trim();
  if (!normalizedId) {
    return responseJson({ error: "invalid_conversation_id" }, { status: 400 });
  }

  const rawLimit = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : undefined;

  try {
    const [messages, participants] = await Promise.all([
      listConversationMessages({ conversationId: normalizedId, viewerId, limit }),
      listConversationParticipants(normalizedId),
    ]);
    await markConversationRead({ conversationId: normalizedId, userId: viewerId });

    const others = participants.filter((participant) => participant.id !== viewerId);

    return responseJson({
      messages,
      participants,
      // Deprecated aliases kept for the 1:1-era client; new code should use
      // `participants`, which supports rooms with more than two people.
      members: participants,
      partner: others[0] ?? null,
    });
  } catch (error) {
    return failureResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: MessagesRouteProps) {
  const senderId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!senderId) return responseJson({ error: "unauthorized" }, { status: 401 });

  const { conversationId } = await params;
  const normalizedId = conversationId.trim();
  if (!normalizedId) {
    return responseJson({ error: "invalid_conversation_id" }, { status: 400 });
  }

  let body: { text?: unknown; clientMessageId?: unknown };
  try {
    body = (await request.json()) as { text?: unknown; clientMessageId?: unknown };
  } catch {
    return responseJson({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.text !== "string") {
    return responseJson({ error: "invalid_text" }, { status: 400 });
  }
  if (body.text.trim().length > CONVERSATION_MESSAGE_TEXT_MAX_LENGTH) {
    return responseJson({ error: "text_too_long" }, { status: 400 });
  }
  const clientMessageId = typeof body.clientMessageId === "string" ? body.clientMessageId : null;

  try {
    const message = await sendConversationMessage({
      conversationId: normalizedId,
      senderId,
      text: body.text,
      clientMessageId,
    });
    return responseJson({ message }, { status: 201 });
  } catch (error) {
    return failureResponse(error);
  }
}
