import { NextRequest } from "next/server";
import { getHashRushRoomRankingsResponse } from "@/server/api/controllers/shared/hash-rush-controller";

type HashRushRoomRankingsRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: HashRushRoomRankingsRouteProps) {
  const { conversationId } = await params;
  return getHashRushRoomRankingsResponse(request, conversationId);
}
