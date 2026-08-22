import { NextRequest } from "next/server";

export { runtime } from "@/server/api/controllers/shared/conversation-controller";
import {
  deleteConversationResponse,
  getConversationMembersResponse,
  getConversationRealtimeTokenResponse,
  getConversationResponse,
  patchConversationResponse,
} from "@/server/api/controllers/shared/conversation-controller";

export { deleteConversationResponse as deleteConversationForIosV1_1_0 };
export { getConversationResponse as getConversationForIosV1_1_0 };
export { patchConversationResponse as patchConversationForIosV1_1_0 };
export { getConversationRealtimeTokenResponse as getConversationRealtimeTokenForIosV1_1_0 };
export { getConversationMembersResponse as getConversationMembersForIosV1_1_0 };

export async function getConversationMembersRouteForIosV1_1_0(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return getConversationMembersResponse(request, conversationId);
}

export async function getConversationRealtimeTokenRouteForIosV1_1_0(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return getConversationRealtimeTokenResponse(request, conversationId);
}

export async function getConversationRouteForIosV1_1_0(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return getConversationResponse(request, conversationId);
}

export async function patchConversationRouteForIosV1_1_0(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return patchConversationResponse(request, conversationId);
}

export async function deleteConversationRouteForIosV1_1_0(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return deleteConversationResponse(request, conversationId);
}
