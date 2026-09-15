import { NextRequest } from "next/server";
import { getConversationSpectateStateResponse } from "@/server/api/controllers/shared/conversation-share-controller";

type SpectateStateRouteProps = {
  params: Promise<{
    shareToken: string;
  }>;
};

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: SpectateStateRouteProps) {
  const { shareToken } = await params;
  return getConversationSpectateStateResponse(request, shareToken);
}
