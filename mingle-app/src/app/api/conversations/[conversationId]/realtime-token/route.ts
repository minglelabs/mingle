import { NextRequest } from "next/server";
import { getConversationRealtimeTokenResponse } from "@/server/api/controllers/shared/conversation-controller";

type RealtimeTokenRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: RealtimeTokenRouteProps) {
  const { conversationId } = await params;
  return getConversationRealtimeTokenResponse(request, conversationId);
}
