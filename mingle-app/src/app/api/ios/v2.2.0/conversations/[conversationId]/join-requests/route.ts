import { NextRequest } from "next/server";
import { getConversationJoinRequestsResponse } from "@/server/api/controllers/shared/public-room-controller";

type RouteProps = { params: Promise<{ conversationId: string }> };

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: RouteProps) {
  const { conversationId } = await params;
  return getConversationJoinRequestsResponse(request, conversationId);
}
