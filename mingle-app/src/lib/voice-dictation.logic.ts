import { canonicalizeTranslationLanguageCode } from "@/lib/translation-languages";

export type DictationTranscript = {
  text: string;
  language: string;
  isFinal: boolean;
};

/**
 * The relay speaks one shape for every provider it fronts:
 * `{ type: 'transcript', data: { is_final, utterance: { text, language } } }`.
 */
export function parseDictationTranscript(raw: string): DictationTranscript | null {
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof message !== "object" || message === null) return null;
  const envelope = message as Record<string, unknown>;
  if (envelope.type !== "transcript") return null;
  if (typeof envelope.data !== "object" || envelope.data === null) return null;

  const data = envelope.data as Record<string, unknown>;
  if (typeof data.utterance !== "object" || data.utterance === null) return null;

  const utterance = data.utterance as Record<string, unknown>;
  const rawText = typeof utterance.text === "string" ? utterance.text : "";
  const text = normalizeDictationText(rawText);
  if (!text) return null;

  return {
    text,
    language: normalizeDictationLanguage(
      typeof utterance.language === "string" ? utterance.language : "",
    ),
    isFinal: data.is_final === true,
  };
}

/**
 * Endpoint markers (`<end>`, `<fin>`) are a segmentation signal for the relay,
 * never something a reader should see in the composer.
 */
export function normalizeDictationText(rawText: string): string {
  return rawText
    .replace(/<\/?(?:end|fin)>/giu, "")
    .replace(/^[\s.,!?;:，。、…—–-]+/u, "")
    .trim();
}

export function normalizeDictationLanguage(rawLanguage: string): string {
  const canonical = canonicalizeTranslationLanguageCode(rawLanguage);
  if (canonical === "zh") return "zh-CN";
  if (canonical) return canonical;
  return (rawLanguage || "").trim().replace(/_/g, "-");
}

/**
 * Joins the turns finalized so far with the turn still in flight. Soniox emits
 * each partial as the *full* text of the current turn, so the live turn
 * replaces rather than appends to itself.
 */
export function composeDictationDraft(input: {
  baseText: string;
  finalizedTurns: readonly string[];
  partialTurn: string;
}): string {
  const spoken = [...input.finalizedTurns, input.partialTurn]
    .map((turn) => turn.trim())
    .filter(Boolean)
    .join(" ");

  const base = input.baseText.trimEnd();
  if (!spoken) return base;
  if (!base) return spoken;
  return `${base} ${spoken}`;
}
