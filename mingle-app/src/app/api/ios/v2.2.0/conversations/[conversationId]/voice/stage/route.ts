import { NextRequest } from "next/server";
import { postVoiceCallStageResponse } from "@/server/api/controllers/shared/voice-call-controller";

type RouteProps = { params: Promise<{ conversationId: string }> };

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: RouteProps) {
  const { conversationId } = await params;
  return postVoiceCallStageResponse(request, conversationId);
}
