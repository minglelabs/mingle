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
