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
};

export type SttPartial = { text: string; lang: string | null };

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
    private audioStartedAt = 0;
    private sentMs = 0;
    private lastSendAt = 0;
    private keepalive: NodeJS.Timeout | null = null;

    constructor(private readonly languageHint: string, private readonly label: string) {
        super();
    }

    start(): void {
        if (!env.sonioxApiKey) throw new Error('SONIOX_API_KEY is missing');
        this.connect();
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
                model: 'stt-rt-v5',
                audio_format: 'pcm_s16le',
                sample_rate: SAMPLE_RATE,
                num_channels: 1,
                language_hints: [this.languageHint],
                enable_language_identification: true,
                enable_endpoint_detection: true,
                max_endpoint_delay_ms: env.sonioxMaxEndpointDelayMs,
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
            } else {
                nonFinal += text;
                nonFinalLang = token.language || nonFinalLang;
            }
        }
        const preview = (this.finalText + nonFinal).trim();
        if (preview) this.emit('partial', { text: preview, lang: this.dominantLang() || nonFinalLang } satisfies SttPartial);
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
        const text = this.finalText.trim();
        const lang = this.dominantLang();
        const speechEndAt = this.audioStartedAt > 0 && this.lastFinalEndMs > 0
            ? this.audioStartedAt + this.lastFinalEndMs
            : finalizedAt;
        this.finalText = '';
        this.finalLangs.clear();
        if (!text) return;
        this.emit('segment', { text, lang, speechEndAt, finalizedAt } satisfies SttSegment);
    }
}
