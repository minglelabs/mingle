import { NextRequest } from "next/server";
import { postConversationShareJoinResponse } from "@/server/api/controllers/shared/conversation-controller";

type ShareJoinRouteProps = {
  params: Promise<{
    shareToken: string;
  }>;
};

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: ShareJoinRouteProps) {
  const { shareToken } = await params;
  return postConversationShareJoinResponse(request, shareToken);
}
