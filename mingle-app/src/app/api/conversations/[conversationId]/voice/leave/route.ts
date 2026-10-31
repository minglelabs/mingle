import { NextRequest } from "next/server";
import { postVoiceCallLeaveResponse } from "@/server/api/controllers/shared/voice-call-controller";

type VoiceLeaveRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: VoiceLeaveRouteProps) {
  const { conversationId } = await params;
  return postVoiceCallLeaveResponse(request, conversationId);
}
