export type SonioxDebugTokenLike = {
    text?: unknown;
    is_final?: unknown;
    language?: unknown;
    speaker?: unknown;
};

export type SonioxDebugTokenRun = {
    isFinal: boolean;
    speaker: string;
    language: string;
    text: string;
};

const ENDPOINT_MARKER_RE = /<\/?(?:end|fin)>/i;

export function normalizeDetectedLang(rawLanguage: unknown): string {
    return typeof rawLanguage === 'string' && rawLanguage.trim()
        ? rawLanguage.trim()
        : 'unknown';
}

export function normalizeSpeaker(rawSpeaker: unknown): string {
    return typeof rawSpeaker === 'string' && rawSpeaker.trim()
        ? rawSpeaker.trim()
        : 'unknown';
}

export function mergeDetectedLang(currentDetectedLang: string, nextDetectedLang: unknown): string {
    const normalizedNext = normalizeDetectedLang(nextDetectedLang);
    if (normalizedNext !== 'unknown') {
        return normalizedNext;
    }
    return normalizeDetectedLang(currentDetectedLang);
}

export function getNextTurnDetectedLang(previousDetectedLang: string, carryText: string): string {
    if (!carryText.trim()) {
        return 'unknown';
    }
    return normalizeDetectedLang(previousDetectedLang);
}

export function shouldUseTokenLanguageForCurrentTurn(params: {
    includeByTurnWatermark: boolean;
    isFinalToken: boolean;
    includeByProviderFinalizedWatermark: boolean;
}): boolean {
    if (!params.includeByTurnWatermark) {
        return false;
    }
    if (!params.isFinalToken) {
        return true;
    }
    return params.includeByProviderFinalizedWatermark;
}

export function buildSonioxDebugTokenRuns(tokens: SonioxDebugTokenLike[]): SonioxDebugTokenRun[] {
    const runs: SonioxDebugTokenRun[] = [];

    for (const token of tokens) {
        const text = typeof token.text === 'string' ? token.text : '';
        if (!text || ENDPOINT_MARKER_RE.test(text)) {
            continue;
        }

        const nextRun: SonioxDebugTokenRun = {
            isFinal: token.is_final === true,
            speaker: normalizeSpeaker(token.speaker),
            language: normalizeDetectedLang(token.language),
            text,
        };

        const previousRun = runs[runs.length - 1];
        if (
            previousRun
            && previousRun.isFinal === nextRun.isFinal
            && previousRun.speaker === nextRun.speaker
            && previousRun.language === nextRun.language
        ) {
            previousRun.text += nextRun.text;
            continue;
        }

        runs.push(nextRun);
    }

    return runs;
}

export function formatSonioxDebugTokenRun(run: SonioxDebugTokenRun): string {
    return `is_final=${run.isFinal}, speaker=${run.speaker}, language=${run.language}, text=${run.text}`;
}
