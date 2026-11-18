import { NextRequest } from "next/server";
import { postHashRushLeaveResponse } from "@/server/api/controllers/shared/hash-rush-controller";

type HashRushLeaveRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: HashRushLeaveRouteProps) {
  const { conversationId } = await params;
  return postHashRushLeaveResponse(request, conversationId);
}
