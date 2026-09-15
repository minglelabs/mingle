import { NextRequest } from "next/server";
import { getConversationSpectateRealtimeTokenResponse } from "@/server/api/controllers/shared/conversation-share-controller";

type SpectateRealtimeTokenRouteProps = {
  params: Promise<{
    shareToken: string;
  }>;
};

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: SpectateRealtimeTokenRouteProps) {
  const { shareToken } = await params;
  return getConversationSpectateRealtimeTokenResponse(shareToken);
}
