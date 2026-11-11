import { randomUUID } from 'crypto';

// What the interpreter tells the mingle app (its internal API, header
// x-voice-internal-secret). Without APP_INTERNAL_URL and VOICE_INTERNAL_SECRET
// nothing is sent and the lines only show in the call.
//
//   POST /api/internal/voice/caption   a finalized line and its translations:
//        the app saves it as a room message only the readers see, and
//        charges its speech-to-text
//   POST /api/internal/voice/playback  a translation read aloud on a lane:
//        the app charges each listener of that lane

const APP_INTERNAL_URL = (process.env.APP_INTERNAL_URL || '').trim().replace(/\/$/, '');
const VOICE_INTERNAL_SECRET = (process.env.VOICE_INTERNAL_SECRET || '').trim();

export function appReportsEnabled(): boolean {
    return !!APP_INTERNAL_URL && !!VOICE_INTERNAL_SECRET;
}

export type CaptionReport = {
    room: string;
    /** Unique per line; the app keeps one message per id. */
    id: string;
    speaker: string;
    lang: string;
    text: string;
    translations: Record<string, string>;
    durationMs: number;
    /** When the line was started (ms since epoch): its place among the room's messages. */
    startedAt: number;
};

export type PlaybackReport = {
    room: string;
    id: string;
    lang: string;
    listeners: string[];
    audioMs: number;
};

async function post(path: string, body: unknown): Promise<void> {
    if (!appReportsEnabled()) return;
    try {
        const response = await fetch(`${APP_INTERNAL_URL}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-voice-internal-secret': VOICE_INTERNAL_SECRET },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) console.warn(`[app] ${path} -> HTTP ${response.status}`);
    } catch (error) {
        console.warn(`[app] ${path} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function reportCaption(report: CaptionReport): Promise<void> {
    return post('/api/internal/voice/caption', report);
}

export function reportPlayback(report: PlaybackReport): Promise<void> {
    return post('/api/internal/voice/playback', report);
}

/** What is already translated of a line said in the call (mingle-app `bubble-tail.ts`). */
export type TailState = {
    translatedSource: string;
    translations: Record<string, string>;
    contextSource?: string;
    contextTranslations?: Record<string, string>;
};

export type TranslateReply = {
    translations: Record<string, string>;
    /** Interim only: the line's translated part grew; `contextTranslations` is the piece just added. */
    tailFill?: Required<TailState>;
    targetLanguages: string[];
    provider?: string;
};

/**
 * POST /api/internal/voice/translate: the room's own translation (the request
 * a phone sends for its speech), into all of the room's languages. Null when
 * the app could not be asked.
 */
export async function requestTranslate(input: {
    room: string;
    text: string;
    sourceLanguage: string;
    isFinal: boolean;
    bubbleTail?: TailState;
}): Promise<TranslateReply | null> {
    if (!appReportsEnabled()) return null;
    try {
        const response = await fetch(`${APP_INTERNAL_URL}/api/internal/voice/translate`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-voice-internal-secret': VOICE_INTERNAL_SECRET },
            body: JSON.stringify(input),
            signal: AbortSignal.timeout(input.isFinal ? 15_000 : 8_000),
        });
        if (!response.ok) {
            console.warn(`[app] /api/internal/voice/translate -> HTTP ${response.status}`);
            return null;
        }
        const data = await response.json() as Partial<TranslateReply>;
        return {
            translations: data.translations && typeof data.translations === 'object' ? data.translations : {},
            ...(data.tailFill ? { tailFill: data.tailFill } : {}),
            targetLanguages: Array.isArray(data.targetLanguages) ? data.targetLanguages : [],
            provider: typeof data.provider === 'string' ? data.provider : undefined,
        };
    } catch (error) {
        console.warn(`[app] /api/internal/voice/translate failed: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

/** A line id that stays unique across interpreter restarts in the same room. */
export function newLineId(room: string): string {
    return `${room}-${randomUUID()}`;
}
