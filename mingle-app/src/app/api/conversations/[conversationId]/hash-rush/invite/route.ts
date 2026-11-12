import { NextRequest } from "next/server";
import { getHashRushInviteResponse } from "@/server/api/controllers/shared/hash-rush-controller";

type HashRushInviteRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: HashRushInviteRouteProps) {
  const { conversationId } = await params;
  return getHashRushInviteResponse(request, conversationId);
}
