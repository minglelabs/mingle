import { NextRequest } from "next/server";

export { runtime } from "@/server/api/controllers/shared/conversation-share-controller";
import {
  getConversationSpectateRealtimeTokenResponse,
  getConversationSpectateStateResponse,
} from "@/server/api/controllers/shared/conversation-share-controller";

export {
  getConversationSpectateStateResponse as getConversationSpectateStateForAndroidV2_0_0,
  getConversationSpectateRealtimeTokenResponse as getConversationSpectateRealtimeTokenForAndroidV2_0_0,
};

export async function getConversationSpectateStateRouteForAndroidV2_0_0(
  request: NextRequest,
  context: { params: Promise<{ shareToken: string }> },
) {
  const { shareToken } = await context.params;
  return getConversationSpectateStateResponse(request, shareToken);
}

export async function getConversationSpectateRealtimeTokenRouteForAndroidV2_0_0(
  request: NextRequest,
  context: { params: Promise<{ shareToken: string }> },
) {
  const { shareToken } = await context.params;
  return getConversationSpectateRealtimeTokenResponse(shareToken);
}
