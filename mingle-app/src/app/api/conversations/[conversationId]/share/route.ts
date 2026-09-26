import { NextRequest } from "next/server";
import {
  getConversationShareResponse,
  postConversationShareResponse,
} from "@/server/api/controllers/shared/conversation-controller";

type ShareRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: ShareRouteProps) {
  const { conversationId } = await params;
  return getConversationShareResponse(request, conversationId);
}

export async function POST(request: NextRequest, { params }: ShareRouteProps) {
  const { conversationId } = await params;
  return postConversationShareResponse(request, conversationId);
}
