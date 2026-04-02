import { NextRequest } from "next/server";
import { patchConversationForAndroidV1_1_0 } from "@/server/api/controllers/android/v1.1.0/conversation-controller";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return patchConversationForAndroidV1_1_0(request, conversationId);
}
