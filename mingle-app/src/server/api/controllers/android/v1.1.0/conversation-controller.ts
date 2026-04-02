import { NextRequest } from "next/server";

export { runtime } from "@/server/api/controllers/shared/conversation-controller";
import {
  getConversationResponse,
  patchConversationResponse,
} from "@/server/api/controllers/shared/conversation-controller";

export { getConversationResponse as getConversationForAndroidV1_1_0 };
export { patchConversationResponse as patchConversationForAndroidV1_1_0 };

export async function getConversationRouteForAndroidV1_1_0(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return getConversationResponse(request, conversationId);
}

export async function patchConversationRouteForAndroidV1_1_0(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return patchConversationResponse(request, conversationId);
}
