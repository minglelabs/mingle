import { NextRequest } from "next/server";
import { postVoiceCallInterpretResponse } from "@/server/api/controllers/shared/voice-call-controller";

type VoiceInterpretRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: VoiceInterpretRouteProps) {
  const { conversationId } = await params;
  return postVoiceCallInterpretResponse(request, conversationId);
}
