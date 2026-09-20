import { NextRequest } from "next/server";

export { runtime } from "@/server/api/controllers/shared/conversation-controller";
import {
  getConversationShareResponse,
  postConversationShareResponse,
  postConversationShareJoinResponse,
} from "@/server/api/controllers/shared/conversation-controller";

export { getConversationShareResponse as getConversationShareForIosV2_0_0 };
export { postConversationShareResponse as postConversationShareForIosV2_0_0 };
export { postConversationShareJoinResponse as postConversationShareJoinForIosV2_0_0 };

export async function getConversationShareRouteForIosV2_0_0(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return getConversationShareResponse(request, conversationId);
}

export async function postConversationShareRouteForIosV2_0_0(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return postConversationShareResponse(request, conversationId);
}

export async function postConversationShareJoinRouteForIosV2_0_0(
  request: NextRequest,
  context: { params: Promise<{ shareToken: string }> },
) {
  const { shareToken } = await context.params;
  return postConversationShareJoinResponse(request, shareToken);
}
