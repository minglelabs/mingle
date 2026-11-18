import type { NextRequest } from "next/server";
import { postVoicePlaybackResponse } from "@/server/api/controllers/shared/voice-interpreter-controller";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return postVoicePlaybackResponse(request);
}
