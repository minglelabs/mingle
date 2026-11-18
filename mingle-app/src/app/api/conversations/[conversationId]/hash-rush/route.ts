import { NextRequest } from "next/server";
import { getHashRushGameResponse } from "@/server/api/controllers/shared/hash-rush-controller";

type HashRushGameRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: HashRushGameRouteProps) {
  const { conversationId } = await params;
  return getHashRushGameResponse(request, conversationId);
}
