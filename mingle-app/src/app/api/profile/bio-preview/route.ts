import { type NextRequest, NextResponse } from "next/server";
import { parseBioPreviewRequest, takeBioPreviewSlot, translateBioPreview } from "@/server/bio-preview";

export const runtime = "nodejs";

/**
 * POST { text, languages } → { translations: { [language]: text } }.
 * The onboarding self-introduction shown in other languages before sign-in
 * (see @/server/bio-preview). Open without an account, so it is rate limited
 * per address and takes a short text only.
 */
export async function POST(request: NextRequest) {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
  if (!takeBioPreviewSlot(address)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const parsed = parseBioPreviewRequest(body);
  if (!parsed) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  try {
    const translations = await translateBioPreview(parsed, request.signal);
    return NextResponse.json({ translations }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[profile/bio-preview] failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "translation_failed" }, { status: 502 });
  }
}
