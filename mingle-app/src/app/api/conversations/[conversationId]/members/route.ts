import { NextRequest } from "next/server";
import {
  getConversationMembersResponse,
  postConversationMembersResponse,
} from "@/server/api/controllers/shared/conversation-controller";

type MembersRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: MembersRouteProps) {
  const { conversationId } = await params;
  return getConversationMembersResponse(request, conversationId);
}

export async function POST(request: NextRequest, { params }: MembersRouteProps) {
  const { conversationId } = await params;
  return postConversationMembersResponse(request, conversationId);
}
