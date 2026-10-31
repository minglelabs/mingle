import { NextRequest } from "next/server";
import { getVoiceCallResponse } from "@/server/api/controllers/shared/voice-call-controller";

type VoiceRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: VoiceRouteProps) {
  const { conversationId } = await params;
  return getVoiceCallResponse(request, conversationId);
}
