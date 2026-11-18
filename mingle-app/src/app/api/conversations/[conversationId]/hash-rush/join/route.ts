import { NextRequest } from "next/server";
import { postHashRushJoinResponse } from "@/server/api/controllers/shared/hash-rush-controller";

type HashRushJoinRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: HashRushJoinRouteProps) {
  const { conversationId } = await params;
  return postHashRushJoinResponse(request, conversationId);
}
