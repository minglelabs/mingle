import {
  conversationFailureResponse,
  conversationJson,
  normalizeRouteId,
  requireSessionUserId,
  unauthorizedResponse,
} from "@/server/api/conversation-route-helpers";
import { requireConversationMembership } from "@/server/conversation-messages";
import { mintConversationRealtimeToken } from "@/server/conversation-realtime";

export const runtime = "nodejs";

type RealtimeTokenRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

/**
 * Mints the token the client hands mingle-stt to open a push channel for this
 * conversation. This is the one place membership actually gets checked —
 * mingle-stt has no database, so everything downstream trusts this signature.
 */
export async function POST(_request: Request, { params }: RealtimeTokenRouteProps) {
  const userId = await requireSessionUserId();
  if (!userId) return unauthorizedResponse();

  const conversationId = normalizeRouteId((await params).conversationId);
  if (!conversationId) {
    return conversationJson({ error: "invalid_conversation_id" }, { status: 400 });
  }

  try {
    await requireConversationMembership(conversationId, userId);
  } catch (error) {
    return conversationFailureResponse(error);
  }

  const token = mintConversationRealtimeToken({ conversationId, userId });
  if (!token) {
    // Realtime push is unconfigured in this environment — not an error the
    // caller needs to see, since the client falls back to polling.
    return conversationJson({ token: null });
  }

  return conversationJson({ token });
}
