import { NextRequest, NextResponse } from "next/server";
import {
  isVoiceInternalRequestAuthorized,
  parseVoiceCaptionReport,
  parseVoicePlaybackReport,
  recordVoiceCaption,
  recordVoicePlayback,
} from "@/server/voice/voice-interpreter-reports";

export const runtime = "nodejs";

/** POST from the voice interpreter: one finalized line of a call. */
export async function postVoiceCaptionResponse(request: NextRequest) {
  if (!isVoiceInternalRequestAuthorized(request.headers.get("x-voice-internal-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const report = parseVoiceCaptionReport(await request.json().catch(() => null));
  if (!report) return NextResponse.json({ error: "invalid_caption" }, { status: 400 });
  return NextResponse.json({ result: await recordVoiceCaption(report) });
}

/** POST from the voice interpreter: a translation it read aloud on a language lane. */
export async function postVoicePlaybackResponse(request: NextRequest) {
  if (!isVoiceInternalRequestAuthorized(request.headers.get("x-voice-internal-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const report = parseVoicePlaybackReport(await request.json().catch(() => null));
  if (!report) return NextResponse.json({ error: "invalid_playback" }, { status: 400 });
  return NextResponse.json({ charged: await recordVoicePlayback(report) });
}
