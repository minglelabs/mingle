import { NextRequest } from "next/server";
import { postVoiceCallTokenResponse } from "@/server/api/controllers/shared/voice-call-controller";

type VoiceTokenRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: VoiceTokenRouteProps) {
  const { conversationId } = await params;
  return postVoiceCallTokenResponse(request, conversationId);
}
