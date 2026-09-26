import { NextRequest } from "next/server";

export { runtime } from "@/server/api/controllers/shared/conversation-share-controller";
import {
  getConversationSpectateStateResponse,
} from "@/server/api/controllers/shared/conversation-share-controller";

export {
  getConversationSpectateStateResponse as getConversationSpectateStateForAndroidV2_0_0,
};

export async function getConversationSpectateStateRouteForAndroidV2_0_0(
  request: NextRequest,
  context: { params: Promise<{ shareToken: string }> },
) {
  const { shareToken } = await context.params;
  return getConversationSpectateStateResponse(request, shareToken);
}
