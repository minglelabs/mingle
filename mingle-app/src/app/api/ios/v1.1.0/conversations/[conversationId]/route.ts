import { NextRequest } from "next/server";
import { patchConversationForIosV1_1_0 } from "@/server/api/controllers/ios/v1.1.0/conversation-controller";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return patchConversationForIosV1_1_0(request, conversationId);
}
