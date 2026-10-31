import { NextRequest } from "next/server";
import { getConversationReadReceiptsResponse } from "@/server/api/controllers/shared/conversation-controller";

type ReadReceiptsRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: ReadReceiptsRouteProps) {
  const { conversationId } = await params;
  return getConversationReadReceiptsResponse(request, conversationId);
}
