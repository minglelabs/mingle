import { NextRequest } from "next/server";
import { handleTranslateFinalizeV1 } from "@/server/api/handlers/v1/translate-finalize-handler";

/**
 * Runs text through the same translation pipeline the live STT screen uses
 * (provider selection, retries, rate-limit cooldowns all live there) without
 * a real HTTP round trip. Best-effort: a provider/network failure returns an
 * empty map instead of throwing, so a translation outage never blocks sending
 * or reading a message — the caller just falls back to the source text.
 */
export async function translateText(args: {
  text: string;
  sourceLanguage: string;
  targetLanguages: string[];
  sessionKey?: string;
}): Promise<Record<string, string>> {
  if (!args.text.trim() || args.targetLanguages.length === 0) {
    return {};
  }

  try {
    const request = new NextRequest("https://internal.mingle/api/translate/finalize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: args.text,
        sourceLanguage: args.sourceLanguage,
        targetLanguages: args.targetLanguages,
        isFinal: true,
        sessionKey: args.sessionKey,
      }),
    });

    const response = await handleTranslateFinalizeV1(request);
    if (!response.ok) return {};

    const payload = await response.json() as { translations?: unknown };
    const translations = payload.translations;
    if (!translations || typeof translations !== "object") return {};

    const result: Record<string, string> = {};
    for (const [language, value] of Object.entries(translations)) {
      if (typeof value === "string" && value.trim()) {
        result[language] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}
