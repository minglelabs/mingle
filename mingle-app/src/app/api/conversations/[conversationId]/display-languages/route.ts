import { type NextRequest } from "next/server";
import { sanitizeSttLanguageSelection } from "@/lib/stt-languages";
import {
  conversationFailureResponse,
  conversationJson,
  normalizeRouteId,
  requireSessionUserId,
  unauthorizedResponse,
} from "@/server/api/conversation-route-helpers";
import {
  getMemberDisplayLanguages,
  setMemberDisplayLanguages,
} from "@/server/conversation-messages";

export const runtime = "nodejs";

type DisplayLanguagesRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export async function GET(_request: NextRequest, { params }: DisplayLanguagesRouteProps) {
  const userId = await requireSessionUserId();
  if (!userId) return unauthorizedResponse();

  const conversationId = normalizeRouteId((await params).conversationId);
  if (!conversationId) {
    return conversationJson({ error: "invalid_conversation_id" }, { status: 400 });
  }

  try {
    return conversationJson(await getMemberDisplayLanguages({ conversationId, userId }));
  } catch (error) {
    return conversationFailureResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: DisplayLanguagesRouteProps) {
  const userId = await requireSessionUserId();
  if (!userId) return unauthorizedResponse();

  const conversationId = normalizeRouteId((await params).conversationId);
  if (!conversationId) {
    return conversationJson({ error: "invalid_conversation_id" }, { status: 400 });
  }

  let body: { displayLanguages?: unknown };
  try {
    body = (await request.json()) as { displayLanguages?: unknown };
  } catch {
    return conversationJson({ error: "invalid_json" }, { status: 400 });
  }

  // Empty is valid on purpose: it resets the member back to just their
  // signup language, so no minimum-selection fallback is applied here.
  const displayLanguages = sanitizeSttLanguageSelection(body.displayLanguages);

  try {
    await setMemberDisplayLanguages({ conversationId, userId, displayLanguages });
    return conversationJson(await getMemberDisplayLanguages({ conversationId, userId }));
  } catch (error) {
    return conversationFailureResponse(error);
  }
}
