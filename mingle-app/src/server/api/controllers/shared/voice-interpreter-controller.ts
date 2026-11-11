import { NextRequest, NextResponse } from "next/server";
import {
  isVoiceInternalRequestAuthorized,
  parseVoiceCaptionReport,
  parseVoicePlaybackReport,
  readVoiceRoomLanguages,
  recordVoiceCaption,
  recordVoicePlayback,
} from "@/server/voice/voice-interpreter-reports";
import { handleTranslateFinalizeV1 } from "@/server/api/handlers/v1/translate-finalize-handler";

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

const languageBase = (value: string) => value.trim().toLowerCase().replace(/_/g, "-").split("-")[0] || "";

/**
 * POST from the voice interpreter: translate a line of the call (while it is
 * being said, or once it is finished) into all the room's languages, with the
 * same request a phone sends for its own speech (`/translate/finalize`,
 * clause by clause through `bubbleTail`), so a caption reads like any other
 * spoken bubble. Free here: the line's speech-to-text pays for it.
 */
export async function postVoiceTranslateResponse(request: NextRequest) {
  if (!isVoiceInternalRequestAuthorized(request.headers.get("x-voice-internal-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const room = typeof body?.room === "string" ? body.room.trim().slice(0, 200) : "";
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const sourceLanguage = typeof body?.sourceLanguage === "string" ? body.sourceLanguage.trim().slice(0, 20) : "";
  if (!body || !room || !text || !sourceLanguage) return NextResponse.json({ error: "invalid_translate" }, { status: 400 });
  const roomLanguages = await readVoiceRoomLanguages(room);
  if (!roomLanguages) return NextResponse.json({ error: "no_call" }, { status: 404 });
  const targetLanguages = roomLanguages.filter((language) => languageBase(language) !== languageBase(sourceLanguage));
  if (targetLanguages.length === 0) return NextResponse.json({ translations: {}, targetLanguages });
  const forwarded = new NextRequest(new URL("/api/translate/finalize", request.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text,
      sourceLanguage,
      targetLanguages,
      isFinal: body.isFinal === true,
      ...(body.bubbleTail ? { bubbleTail: body.bubbleTail } : {}),
      // Spoken, not typed: no per-message translation charge.
      sttDurationMs: 1,
      sessionKey: `voice-interpreter:${room}`.slice(0, 200),
    }),
  });
  const response = await handleTranslateFinalizeV1(forwarded);
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  return NextResponse.json({ ...payload, targetLanguages }, { status: response.status });
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
