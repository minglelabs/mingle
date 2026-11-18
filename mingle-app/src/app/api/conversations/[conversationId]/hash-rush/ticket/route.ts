import { NextRequest } from "next/server";
import { postHashRushTicketResponse } from "@/server/api/controllers/shared/hash-rush-controller";

type HashRushTicketRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: HashRushTicketRouteProps) {
  const { conversationId } = await params;
  return postHashRushTicketResponse(request, conversationId);
}
