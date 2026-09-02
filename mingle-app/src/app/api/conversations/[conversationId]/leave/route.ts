import { NextRequest } from "next/server";
import { leaveConversationResponse } from "@/server/api/controllers/shared/conversation-controller";

type LeaveRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: LeaveRouteProps) {
  const { conversationId } = await params;
  return leaveConversationResponse(request, conversationId);
}
