import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { env } from './env';

const SONIOX_WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket';
const SAMPLE_RATE = 16000;
const KEEPALIVE_IDLE_MS = 5000;

type SonioxToken = {
    text?: string;
    is_final?: boolean;
    language?: string;
    start_ms?: number;
    end_ms?: number;
};

export type SttSegment = {
    text: string;
    lang: string | null;
    // Wall-clock time of the last spoken word, derived from Soniox's audio
    // timestamps and the wall time the first audio byte was sent.
    speechEndAt: number;
    // Wall-clock time the endpoint token arrived.
    finalizedAt: number;
    // Length of the spoken words (first to last), for billing.
    durationMs: number;
    // Every language Soniox labeled in the line (the phone's sttLanguages).
    languages: string[];
};

export type SttPartial = { text: string; lang: string | null };

/**
 * How lines are cut, as the speaker set it in the app (mingle-stt
 * `segmentation-strategy.ts`): "end" lets Soniox find the end of a line with
 * the auto-detect step's latency/sensitivity; "fin" asks Soniox to finalize
 * after a set silence.
 */
export type SttSegmentation = { mode: 'end' | 'fin'; tuningStep: number; maxDelayMs: number; silenceMs: number };

// mingle-stt SONIOX_ENDPOINT_TUNING_PROFILES: step -> (latency level, sensitivity).
const TUNING_PROFILES: ReadonlyArray<{ level: number; sensitivity: number }> = [
    { level: 3, sensitivity: 1.0 },
    { level: 2, sensitivity: 0.8 },
    { level: 1, sensitivity: 0.5 },
    { level: 0, sensitivity: 0.0 },
    { level: 0, sensitivity: -1.0 },
];
const FIN_CHECK_MS = 100;
const FIN_RESPONSE_TIMEOUT_MS = 2_500;

export function sonioxSegmentationConfig(segmentation: SttSegmentation): Record<string, unknown> {
    if (segmentation.mode === 'fin') return { enable_endpoint_detection: false };
    const profile = TUNING_PROFILES[Math.max(0, Math.min(4, Math.floor(segmentation.tuningStep)))] || TUNING_PROFILES[2];
    return {
        enable_endpoint_detection: true,
        endpoint_latency_adjustment_level: profile.level,
        endpoint_sensitivity: profile.sensitivity,
        max_endpoint_delay_ms: Math.max(500, Math.min(3000, Math.floor(segmentation.maxDelayMs))),
    };
}

// One Soniox realtime session per speaker. Endpoint detection (`<end>`) closes
// a segment; the speaker's language is only a hint, Soniox still identifies it.
export class SonioxStream extends EventEmitter {
    private ws: WebSocket | null = null;
    private stopped = false;
    private ready = false;
    private pending: Buffer[] = [];
    private finalText = '';
    private finalLangs = new Map<string, number>();
    private lastFinalEndMs = 0;
    private firstFinalStartMs = -1;
    private audioStartedAt = 0;
    private sentMs = 0;
    private lastSendAt = 0;
    private keepalive: NodeJS.Timeout | null = null;
    private finTimer: NodeJS.Timeout | null = null;
    private nonFinalText = '';
    private textChangedAt = 0;
    private finalizeSentAt = 0;
    // The phone's default when the speaker's own setting cannot be read (3단계, 3000 ms).
    private segmentation: SttSegmentation = { mode: 'end', tuningStep: 2, maxDelayMs: 3000, silenceMs: 1000 };

    constructor(private readonly languageHint: string, private readonly label: string) {
        super();
    }

    /** The speaker's own way of cutting lines; call before start(). */
    configure(segmentation: SttSegmentation): void {
        this.segmentation = segmentation;
    }

    start(): void {
        if (!env.sonioxApiKey) throw new Error('SONIOX_API_KEY is missing');
        if (this.stopped) return;
        this.connect();
        if (this.segmentation.mode === 'fin') this.finTimer = setInterval(() => this.checkSilence(), FIN_CHECK_MS);
        this.keepalive = setInterval(() => {
            if (this.ws && this.ready && Date.now() - this.lastSendAt > KEEPALIVE_IDLE_MS) {
                this.ws.send(JSON.stringify({ type: 'keepalive' }));
            }
        }, KEEPALIVE_IDLE_MS);
    }

    write(samples: Int16Array): void {
        if (this.stopped) return;
        const chunk = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
        if (this.audioStartedAt === 0) this.audioStartedAt = Date.now();
        this.sentMs += (samples.length / SAMPLE_RATE) * 1000;
        if (!this.ready || !this.ws) {
            this.pending.push(Buffer.from(chunk));
            if (this.pending.length > 250) this.pending.shift();
            return;
        }
        this.ws.send(chunk);
        this.lastSendAt = Date.now();
    }

    stop(): void {
        this.stopped = true;
        if (this.keepalive) clearInterval(this.keepalive);
        if (this.finTimer) clearInterval(this.finTimer);
        this.ws?.close();
        this.ws = null;
    }

    private connect(): void {
        const ws = new WebSocket(SONIOX_WS_URL);
        this.ws = ws;
        this.ready = false;
        // Audio time restarts at 0 on every session.
        this.audioStartedAt = 0;
        this.sentMs = 0;
        ws.on('open', () => {
            ws.send(JSON.stringify({
                api_key: env.sonioxApiKey,
                model: 'stt-rt-v6',
                audio_format: 'pcm_s16le',
                sample_rate: SAMPLE_RATE,
                num_channels: 1,
                language_hints: [this.languageHint],
                enable_language_identification: true,
                ...sonioxSegmentationConfig(this.segmentation),
            }));
            this.ready = true;
            for (const chunk of this.pending.splice(0)) ws.send(chunk);
            this.lastSendAt = Date.now();
        });
        ws.on('message', (raw) => this.onMessage(raw.toString()));
        ws.on('error', (error) => console.warn(`[stt:${this.label}] socket error: ${error.message}`));
        ws.on('close', (code, reason) => {
            if (this.ws !== ws) return;
            this.ready = false;
            if (this.stopped) return;
            console.warn(`[stt:${this.label}] closed ${code} ${reason.toString()} — reconnecting`);
            this.flushSegment(Date.now());
            setTimeout(() => !this.stopped && this.connect(), 500);
        });
    }

    private onMessage(raw: string): void {
        let message: { tokens?: SonioxToken[]; error_code?: number; error_message?: string };
        try {
            message = JSON.parse(raw);
        } catch {
            return;
        }
        if (message.error_code) {
            console.warn(`[stt:${this.label}] soniox error ${message.error_code}: ${message.error_message}`);
            return;
        }
        let nonFinal = '';
        let nonFinalLang: string | null = null;
        for (const token of message.tokens || []) {
            const text = token.text || '';
            if (token.is_final) {
                if (text === '<end>' || text === '<fin>') {
                    this.flushSegment(Date.now());
                    continue;
                }
                this.finalText += text;
                if (token.language) this.finalLangs.set(token.language, (this.finalLangs.get(token.language) || 0) + text.length);
                if (typeof token.end_ms === 'number') this.lastFinalEndMs = Math.max(this.lastFinalEndMs, token.end_ms);
                if (typeof token.start_ms === 'number' && (this.firstFinalStartMs < 0 || token.start_ms < this.firstFinalStartMs)) this.firstFinalStartMs = token.start_ms;
            } else {
                nonFinal += text;
                nonFinalLang = token.language || nonFinalLang;
            }
        }
        if (nonFinal !== this.nonFinalText || (message.tokens || []).some((token) => token.is_final && token.text && !/^<\/?(end|fin)>$/.test(token.text))) {
            this.textChangedAt = Date.now();
        }
        this.nonFinalText = nonFinal;
        const preview = (this.finalText + nonFinal).trim();
        if (preview) this.emit('partial', { text: preview, lang: this.dominantLang() || nonFinalLang } satisfies SttPartial);
    }

    // Silence mode: once the words stop for the speaker's silence, Soniox is
    // asked to finalize; its <fin> closes the line (or a timeout does).
    private checkSilence(): void {
        if (!this.ws || !this.ready) return;
        const pending = (this.finalText + this.nonFinalText).trim();
        const now = Date.now();
        if (this.finalizeSentAt) {
            if (now - this.finalizeSentAt > FIN_RESPONSE_TIMEOUT_MS) {
                this.finalizeSentAt = 0;
                this.flushSegment(now);
            }
            return;
        }
        if (!pending || now - this.textChangedAt < this.segmentation.silenceMs) return;
        this.finalizeSentAt = now;
        this.ws.send(JSON.stringify({ type: 'finalize' }));
    }

    private dominantLang(): string | null {
        let best: string | null = null;
        let bestCount = 0;
        for (const [lang, count] of this.finalLangs) {
            if (count > bestCount) {
                best = lang;
                bestCount = count;
            }
        }
        return best;
    }

    private flushSegment(finalizedAt: number): void {
        this.finalizeSentAt = 0;
        this.nonFinalText = '';
        const text = this.finalText.trim();
        const lang = this.dominantLang();
        const languages = [...this.finalLangs.keys()];
        const speechEndAt = this.audioStartedAt > 0 && this.lastFinalEndMs > 0
            ? this.audioStartedAt + this.lastFinalEndMs
            : finalizedAt;
        const durationMs = this.firstFinalStartMs >= 0 && this.lastFinalEndMs > this.firstFinalStartMs
            ? this.lastFinalEndMs - this.firstFinalStartMs
            : 0;
        this.finalText = '';
        this.finalLangs.clear();
        this.firstFinalStartMs = -1;
        if (!text) return;
        this.emit('segment', { text, lang, speechEndAt, finalizedAt, durationMs, languages } satisfies SttSegment);
    }
}
