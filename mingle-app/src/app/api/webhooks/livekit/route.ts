import { NextRequest } from "next/server";
import { postLiveKitWebhookResponse } from "@/server/api/controllers/shared/voice-call-controller";

export const runtime = "nodejs";

// Called by the self-hosted LiveKit server (livekit.yaml `webhook.urls`).
export async function POST(request: NextRequest) {
  return postLiveKitWebhookResponse(request);
}
