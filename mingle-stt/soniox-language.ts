export type SonioxDebugTokenLike = {
    text?: unknown;
    is_final?: unknown;
    language?: unknown;
    speaker?: unknown;
    translation_status?: unknown;
};

export type SonioxDebugTokenRun = {
    isFinal: boolean;
    speaker: string;
    language: string;
    text: string;
};

export type SonioxPendingTurnLike = {
    speaker: string;
    currentSnapshotText: string;
    currentSnapshotEndMs: number;
    detectedLang: string;
    lastProgressAtMs?: number;
};

export type SonioxFinalizeRequestSpeaker = {
    speaker: string;
    snapshotText: string;
    snapshotTextLen: number;
    snapshotEndMs: number;
    detectedLang: string;
};

const ENDPOINT_MARKER_RE = /<\/?(?:end|fin)>/i;
const ENDPOINT_MARKER_RE_GLOBAL = /<\/?(?:end|fin)>/gi;

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
        if (!text || token.translation_status === 'translation' || ENDPOINT_MARKER_RE.test(text)) {
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

export function hasPendingSonioxTurnText(text: string): boolean {
    return text.replace(ENDPOINT_MARKER_RE_GLOBAL, '').trim().length > 0;
}

export function buildSonioxPendingSignature(turns: SonioxPendingTurnLike[]): string {
    return [...turns]
        .filter((turn) => hasPendingSonioxTurnText(turn.currentSnapshotText))
        .sort((left, right) => normalizeSpeaker(left.speaker).localeCompare(normalizeSpeaker(right.speaker)))
        .map((turn) => [
            normalizeSpeaker(turn.speaker),
            stripEndpointMarkersForSignature(turn.currentSnapshotText).trim(),
        ].join('\u001f'))
        .join('\u001e');
}

export function buildSonioxFinalizeRequestCohort(
    turns: SonioxPendingTurnLike[],
    opts: { idleBeforeMs?: number } = {},
): SonioxFinalizeRequestSpeaker[] {
    return [...turns]
        .filter((turn) => hasPendingSonioxTurnText(turn.currentSnapshotText))
        .filter((turn) => {
            if (opts.idleBeforeMs === undefined) return true;
            return typeof turn.lastProgressAtMs === 'number'
                && Number.isFinite(turn.lastProgressAtMs)
                && turn.lastProgressAtMs > 0
                && turn.lastProgressAtMs <= opts.idleBeforeMs;
        })
        .sort((left, right) => normalizeSpeaker(left.speaker).localeCompare(normalizeSpeaker(right.speaker)))
        .map((turn) => ({
            speaker: normalizeSpeaker(turn.speaker),
            snapshotText: turn.currentSnapshotText,
            snapshotTextLen: turn.currentSnapshotText.length,
            snapshotEndMs: Number.isFinite(turn.currentSnapshotEndMs) ? turn.currentSnapshotEndMs : -1,
            detectedLang: normalizeDetectedLang(turn.detectedLang),
        }));
}

function stripEndpointMarkersForSignature(text: string): string {
    return text.replace(ENDPOINT_MARKER_RE_GLOBAL, '');
}
