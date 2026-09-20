import { NextRequest } from "next/server";

export { runtime } from "@/server/api/controllers/shared/conversation-controller";
import {
  getConversationShareResponse,
  postConversationShareResponse,
  postConversationShareJoinResponse,
} from "@/server/api/controllers/shared/conversation-controller";

export { getConversationShareResponse as getConversationShareForAndroidV2_0_0 };
export { postConversationShareResponse as postConversationShareForAndroidV2_0_0 };
export { postConversationShareJoinResponse as postConversationShareJoinForAndroidV2_0_0 };

export async function getConversationShareRouteForAndroidV2_0_0(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return getConversationShareResponse(request, conversationId);
}

export async function postConversationShareRouteForAndroidV2_0_0(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return postConversationShareResponse(request, conversationId);
}

export async function postConversationShareJoinRouteForAndroidV2_0_0(
  request: NextRequest,
  context: { params: Promise<{ shareToken: string }> },
) {
  const { shareToken } = await context.params;
  return postConversationShareJoinResponse(request, shareToken);
}
