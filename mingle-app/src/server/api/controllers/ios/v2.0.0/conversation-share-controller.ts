import { NextRequest } from "next/server";

export { runtime } from "@/server/api/controllers/shared/conversation-share-controller";
import {
  getConversationSpectateRealtimeTokenResponse,
  getConversationSpectateStateResponse,
} from "@/server/api/controllers/shared/conversation-share-controller";

export {
  getConversationSpectateStateResponse as getConversationSpectateStateForIosV2_0_0,
  getConversationSpectateRealtimeTokenResponse as getConversationSpectateRealtimeTokenForIosV2_0_0,
};

export async function getConversationSpectateStateRouteForIosV2_0_0(
  request: NextRequest,
  context: { params: Promise<{ shareToken: string }> },
) {
  const { shareToken } = await context.params;
  return getConversationSpectateStateResponse(request, shareToken);
}

export async function getConversationSpectateRealtimeTokenRouteForIosV2_0_0(
  request: NextRequest,
  context: { params: Promise<{ shareToken: string }> },
) {
  const { shareToken } = await context.params;
  return getConversationSpectateRealtimeTokenResponse(shareToken);
}
