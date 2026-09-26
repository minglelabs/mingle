import { NextRequest } from "next/server";
import { leaveConversationResponse } from "@/server/api/controllers/shared/conversation-controller";

type LeaveRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const runtime = "nodejs";

// New in v2.0.0 — no shipped app version before this one has UI that calls
// it, so it's intentionally not backfilled into v1.1.0-v1.1.4 (see the
// unversioned leave/route.ts for the same reasoning).
export async function POST(request: NextRequest, { params }: LeaveRouteProps) {
  const { conversationId } = await params;
  return leaveConversationResponse(request, conversationId);
}
