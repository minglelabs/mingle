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

export type SonioxSpeakerChurnTurnLike = {
    speaker: string;
    text: string;
    language: string;
    endMs?: number;
    progressAtMs?: number;
};

const ENDPOINT_MARKER_RE = /<\/?(?:end|fin)>/i;
const ENDPOINT_MARKER_RE_GLOBAL = /<\/?(?:end|fin)>/gi;
const SPEAKER_CHURN_MIN_NORMALIZED_TEXT_LENGTH = 24;
const SPEAKER_CHURN_MIN_WORD_COUNT = 5;
const SPEAKER_CHURN_DEFAULT_END_WINDOW_MS = 2500;
const SPEAKER_CHURN_DEFAULT_PROGRESS_WINDOW_MS = 2500;

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

export function isLikelySonioxSpeakerChurnDuplicate(
    candidate: SonioxSpeakerChurnTurnLike,
    owner: SonioxSpeakerChurnTurnLike,
    opts: { endWindowMs?: number; progressWindowMs?: number } = {},
): boolean {
    if (normalizeSpeaker(candidate.speaker) === normalizeSpeaker(owner.speaker)) {
        return false;
    }

    const candidateText = normalizeSpeakerChurnText(candidate.text);
    const ownerText = normalizeSpeakerChurnText(owner.text);
    if (!hasEnoughSpeakerChurnText(candidateText)) return false;
    if (ownerText.length < candidateText.length) return false;
    if (ownerText !== candidateText && !ownerText.startsWith(candidateText)) {
        return false;
    }

    const candidateLang = normalizeDetectedLang(candidate.language);
    const ownerLang = normalizeDetectedLang(owner.language);
    if (candidateLang !== 'unknown' && ownerLang !== 'unknown' && candidateLang !== ownerLang) {
        return false;
    }

    const endWindowMs = opts.endWindowMs ?? SPEAKER_CHURN_DEFAULT_END_WINDOW_MS;
    if (areFiniteNumbers(candidate.endMs, owner.endMs)) {
        return Math.abs(candidate.endMs! - owner.endMs!) <= endWindowMs;
    }

    const progressWindowMs = opts.progressWindowMs ?? SPEAKER_CHURN_DEFAULT_PROGRESS_WINDOW_MS;
    if (areFiniteNumbers(candidate.progressAtMs, owner.progressAtMs)) {
        return Math.abs(candidate.progressAtMs! - owner.progressAtMs!) <= progressWindowMs;
    }

    return false;
}

function stripEndpointMarkersForSignature(text: string): string {
    return text.replace(ENDPOINT_MARKER_RE_GLOBAL, '');
}

function normalizeSpeakerChurnText(text: string): string {
    return stripEndpointMarkersForSignature(text)
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201c\u201d]/g, '"')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function hasEnoughSpeakerChurnText(text: string): boolean {
    if (text.length < SPEAKER_CHURN_MIN_NORMALIZED_TEXT_LENGTH) return false;
    return text.split(/\s+/).filter(Boolean).length >= SPEAKER_CHURN_MIN_WORD_COUNT;
}

function areFiniteNumbers(left: unknown, right: unknown): boolean {
    return typeof left === 'number'
        && Number.isFinite(left)
        && typeof right === 'number'
        && Number.isFinite(right);
}
