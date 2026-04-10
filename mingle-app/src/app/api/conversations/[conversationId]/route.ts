import { NextRequest } from "next/server";
import {
  deleteConversationResponse,
  getConversationResponse,
  patchConversationResponse,
} from "@/server/api/controllers/shared/conversation-controller";

type ConversationRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: ConversationRouteProps) {
  const { conversationId } = await params;
  return getConversationResponse(request, conversationId);
}

export async function PATCH(request: NextRequest, { params }: ConversationRouteProps) {
  const { conversationId } = await params;
  return patchConversationResponse(request, conversationId);
}

export async function DELETE(request: NextRequest, { params }: ConversationRouteProps) {
  const { conversationId } = await params;
  return deleteConversationResponse(request, conversationId);
}
