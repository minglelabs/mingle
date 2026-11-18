import { NextRequest } from "next/server";
import { postConversationVisibilityResponse } from "@/server/api/controllers/shared/public-room-controller";

type RouteProps = { params: Promise<{ conversationId: string }> };

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: RouteProps) {
  const { conversationId } = await params;
  return postConversationVisibilityResponse(request, conversationId);
}
