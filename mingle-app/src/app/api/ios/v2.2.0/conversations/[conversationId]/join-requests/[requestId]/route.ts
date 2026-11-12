import { NextRequest } from "next/server";
import { postConversationJoinRequestDecisionResponse } from "@/server/api/controllers/shared/public-room-controller";

type RouteProps = { params: Promise<{ conversationId: string; requestId: string }> };

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: RouteProps) {
  const { conversationId, requestId } = await params;
  return postConversationJoinRequestDecisionResponse(request, conversationId, requestId);
}
