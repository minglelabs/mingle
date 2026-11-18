// When to ask for the next clause of a line being said: the same rule as a
// phone's own speech (mingle-app `src/lib/bubble-tail.ts`,
// `shouldRequestInterimFill`), copied here because this service is built on
// its own. Keep the two in step.

const CUT_CANDIDATE = /[.,!?;:…。、，！？；：،؛؟।]/g;
const SENTENCE_END = /[.!?…。！？؟।]$/;
const DENSE_SCRIPT_CHAR = /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Myanmar}\p{Script=Khmer}]/gu;
const LETTER = /\p{L}/gu;

export const INTERIM_FILL_FALLBACK_CHARS_DENSE = 40;
export const INTERIM_FILL_FALLBACK_CHARS_DEFAULT = 80;
const INTERIM_FILL_MIN_CHARS_DIVISOR = 4;

export function countInterimCutCandidates(text: string): number {
    const trimmed = (text || '').trim();
    let count = 0;
    for (const match of trimmed.matchAll(CUT_CANDIDATE)) {
        const index = match.index ?? 0;
        const before = trimmed[index - 1] || '';
        const after = trimmed[index + 1] || '';
        if (/\d/.test(before) && /\d/.test(after)) continue;
        if (index < trimmed.length - 1 || SENTENCE_END.test(trimmed)) count += 1;
    }
    return count;
}

export function resolveInterimFillFallbackChars(text: string): number {
    const total = (text.match(LETTER) || []).length;
    if (total === 0) return INTERIM_FILL_FALLBACK_CHARS_DEFAULT;
    const dense = (text.match(DENSE_SCRIPT_CHAR) || []).length;
    return dense * 2 >= total ? INTERIM_FILL_FALLBACK_CHARS_DENSE : INTERIM_FILL_FALLBACK_CHARS_DEFAULT;
}

export function shouldRequestInterimFill(currentText: string, lastRequestedText: string): boolean {
    const current = (currentText || '').trim();
    const last = (lastRequestedText || '').trim();
    if (!current || current === last) return false;
    const grown = current.length - last.length;
    const fallbackChars = resolveInterimFillFallbackChars(current);
    const minChars = fallbackChars / INTERIM_FILL_MIN_CHARS_DIVISOR;
    if (grown >= minChars && countInterimCutCandidates(current) > countInterimCutCandidates(last)) return true;
    return grown >= fallbackChars;
}

/**
 * What the final translation adds after the clauses already read aloud: the
 * translation minus its already-spoken start ('' when it does not start with
 * it, i.e. the model rewrote the start; then nothing more is read).
 */
export function unspokenRest(full: string, spoken: string): string {
    const text = (full || '').trim();
    const said = (spoken || '').trim();
    if (!said) return text;
    return text.startsWith(said) ? text.slice(said.length).trim() : '';
}

// ===== Context sent with each translation (mingle-app use-realtime-stt) =====
// The same context a phone sends with its own speech: the lines of the last
// 10 s (buildRecentTurnContextPayload) and, while the line has nothing fixed
// yet, the previous line's last piece (buildPreviousBubblePiece).

export const RECENT_TURN_CONTEXT_WINDOW_MS = 10_000;
export const PREVIOUS_BUBBLE_PIECE_WINDOW_MS = 10_000;

export type HistoryLine = {
    id: string;
    lang: string;
    text: string;
    translations: Record<string, string>;
    startedAt: number;
    endedAt: number;
    tail: { translatedSource: string; translations: Record<string, string>; contextSource?: string; contextTranslations?: Record<string, string> } | null;
};

export type RecentTurn = {
    sourceLanguage: string;
    sourceText: string;
    translations: Record<string, string>;
    occurredAtMs: number;
    ageMs: number;
    isFinalized: boolean;
};

const withoutSource = (translations: Record<string, string>, lang: string) =>
    Object.fromEntries(Object.entries(translations).filter(([key, text]) => key !== lang && !!text));

export function buildRecentTurns(history: readonly HistoryLine[], now: number, excludeId?: string): RecentTurn[] {
    const turns: RecentTurn[] = [];
    for (const line of history) {
        if (line.id === excludeId || !line.text.trim()) continue;
        if (line.startedAt < now - RECENT_TURN_CONTEXT_WINDOW_MS || line.startedAt > now) continue;
        const translations = withoutSource(line.translations, line.lang || 'unknown');
        turns.push({
            sourceLanguage: line.lang || 'unknown',
            sourceText: line.text.trim(),
            translations,
            occurredAtMs: line.startedAt,
            ageMs: Math.max(0, now - line.startedAt),
            isFinalized: Object.keys(translations).length > 0,
        });
    }
    return turns.sort((a, b) => a.occurredAtMs - b.occurredAtMs);
}

export function buildPreviousPiece(history: readonly HistoryLine[], now: number, excludeId: string):
    { previousSource: string; previousSourceLanguage?: string; previousTranslations: Record<string, string> } | null {
    let previous: HistoryLine | null = null;
    for (const line of history) {
        if (line.id === excludeId || !line.text.trim()) continue;
        if (now - line.endedAt > PREVIOUS_BUBBLE_PIECE_WINDOW_MS || line.endedAt > now) continue;
        previous = line;
    }
    if (!previous) return null;
    const sourceLanguage = (previous.lang || '').trim();
    const sourceText = previous.text.trim();
    const translations = withoutSource(previous.translations, sourceLanguage || 'unknown');
    const tail = previous.tail;
    let pieceSource = sourceText;
    let pieceTranslations: Record<string, string> = translations;
    if (tail?.translatedSource && sourceText.startsWith(tail.translatedSource)) {
        const rest = sourceText.slice(tail.translatedSource.length).trim();
        if (rest) {
            pieceSource = rest;
            pieceTranslations = {};
            for (const [language, text] of Object.entries(translations)) {
                const fixed = tail.translations[language] || '';
                if (fixed && text.startsWith(fixed) && text.slice(fixed.length).trim()) pieceTranslations[language] = text.slice(fixed.length).trim();
            }
        } else if (tail.contextSource) {
            pieceSource = tail.contextSource;
            pieceTranslations = tail.contextTranslations || {};
        }
    }
    return {
        previousSource: pieceSource,
        ...(sourceLanguage ? { previousSourceLanguage: sourceLanguage } : {}),
        previousTranslations: pieceTranslations,
    };
}
