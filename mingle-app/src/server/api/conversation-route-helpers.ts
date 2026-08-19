import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { ConversationMessageError } from "@/server/conversation-messages";

/**
 * Every conversation route answers the same three questions the same way: who
 * is calling, how does a payload get serialized, and what HTTP status does a
 * given domain failure map to. Keeping one copy means a new failure reason
 * lands in one table rather than four.
 */
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

export function conversationJson(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...init?.headers,
    },
  });
}

/** The signed-in user's id, or `""` when there is no usable session. */
export async function requireSessionUserId(): Promise<string> {
  const session = await getServerSession(getAuthOptions()) as { user?: { id?: unknown } } | null;
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

export function unauthorizedResponse(): NextResponse {
  return conversationJson({ error: "unauthorized" }, { status: 401 });
}

/**
 * Turns a domain error into its HTTP shape. Anything that is not a
 * {@link ConversationMessageError} is a real fault and is rethrown so it
 * surfaces as a 500 rather than being flattened into a 400.
 */
export function conversationFailureResponse(error: unknown): NextResponse {
  if (error instanceof ConversationMessageError) {
    return conversationJson(
      { error: error.reason },
      { status: FAILURE_STATUS[error.reason] ?? 400 },
    );
  }
  throw error;
}

/** Trims a path parameter, returning `""` when it carries nothing usable. */
export function normalizeRouteId(rawId: string): string {
  return rawId.trim();
}
