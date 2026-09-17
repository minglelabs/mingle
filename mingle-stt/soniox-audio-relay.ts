import { WebSocket } from 'ws';

export type SonioxStreamFailure = {
    code: string;
    category: string;
    message: string;
    errorType?: string;
    requestId?: string;
};

export type SonioxRelayTiming = {
    keepaliveIntervalMs?: number;
    firstAudioTimeoutMs?: number;
    audioIdleTimeoutMs?: number;
};

// Native capture can start before the provider handshake finishes. Retain the
// beginning of the stream, including silence, without allowing an unbounded queue.
export class SonioxAudioRelay {
    private readonly maxBufferedBytes: number;
    private pending: Buffer[] = [];
    private pendingBytes = 0;
    private readyAt: number | null = null;
    private firstReceivedAt: number | null = null;
    private firstForwardedAt: number | null = null;
    private lastReceivedAt: number | null = null;
    private lastForwardedAt: number | null = null;
    private receivedChunks = 0;
    private forwardedChunks = 0;
    private forwardedBytes = 0;
    private keepalives = 0;
    private stopped = false;
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly socket: WebSocket,
        sampleRate: number,
        private readonly fail: (failure: SonioxStreamFailure) => void,
        private readonly timing: SonioxRelayTiming = {},
    ) {
        const safeRate = Number.isFinite(sampleRate) ? Math.max(8_000, Math.min(192_000, sampleRate)) : 48_000;
        this.maxBufferedBytes = safeRate * 2 * 5; // Five seconds of mono PCM16.
    }

    receive(chunk: Buffer): void {
        if (this.stopped || chunk.length === 0) return;
        const now = Date.now();
        this.firstReceivedAt ??= now;
        this.lastReceivedAt = now;
        this.receivedChunks += 1;
        if (this.readyAt !== null) {
            this.forward(chunk);
            return;
        }
        if (this.pendingBytes + chunk.length > this.maxBufferedBytes || this.pending.length >= 512) {
            this.reject('audio_buffer_overflow', 'Audio exceeded the provider startup buffer.');
            return;
        }
        this.pending.push(chunk);
        this.pendingBytes += chunk.length;
    }

    // Must be called only after the provider configuration has been sent.
    start(): boolean {
        if (this.stopped) return false;
        if (this.readyAt !== null) return true;
        this.readyAt = Date.now();
        const pending = this.pending;
        this.pending = [];
        this.pendingBytes = 0;
        for (const chunk of pending) {
            if (!this.forward(chunk)) return false;
        }
        this.timer = setInterval(() => this.checkAudio(), this.timing.keepaliveIntervalMs ?? 5_000);
        this.timer.unref();
        return true;
    }

    stop(): void {
        this.stopped = true;
        this.pending = [];
        this.pendingBytes = 0;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    snapshot(now = Date.now()) {
        return {
            providerReadyAt: this.readyAt,
            firstAudioReceivedAt: this.firstReceivedAt,
            firstAudioForwardedAt: this.firstForwardedAt,
            lastAudioReceivedAgeMs: this.lastReceivedAt === null ? null : now - this.lastReceivedAt,
            lastAudioForwardedAgeMs: this.lastForwardedAt === null ? null : now - this.lastForwardedAt,
            receivedChunks: this.receivedChunks,
            forwardedChunks: this.forwardedChunks,
            forwardedBytes: this.forwardedBytes,
            queuedChunks: this.pending.length,
            queuedBytes: this.pendingBytes,
            keepalives: this.keepalives,
        };
    }

    private forward(chunk: Buffer): boolean {
        if (this.stopped) return false;
        if (this.socket.bufferedAmount + chunk.length > this.maxBufferedBytes) {
            this.reject('audio_backpressure', 'The provider is not accepting audio fast enough.');
            return false;
        }
        if (!this.send(chunk)) return false;
        const now = Date.now();
        this.firstForwardedAt ??= now;
        this.lastForwardedAt = now;
        this.forwardedChunks += 1;
        this.forwardedBytes += chunk.length;
        return true;
    }

    private send(data: Buffer | string): boolean {
        if (this.socket.readyState !== WebSocket.OPEN) {
            this.reject('upstream_unavailable', 'The speech provider connection is not open.');
            return false;
        }
        try {
            this.socket.send(data, (error) => {
                if (error) this.reject('upstream_send_error', 'Could not send audio to the speech provider.');
            });
            return !this.stopped;
        } catch {
            this.reject('upstream_send_error', 'Could not send audio to the speech provider.');
            return false;
        }
    }

    private checkAudio(): void {
        if (this.stopped || this.readyAt === null) return;
        const now = Date.now();
        const lastAudioAt = this.lastReceivedAt ?? this.readyAt;
        const timeoutMs = this.firstReceivedAt === null
            ? (this.timing.firstAudioTimeoutMs ?? 15_000)
            : (this.timing.audioIdleTimeoutMs ?? 30_000);
        if (now - lastAudioAt >= timeoutMs) {
            // A keepalive must not mask a dead microphone/client indefinitely.
            this.reject('audio_input_timeout', 'No microphone audio is reaching the server.', '408');
            return;
        }
        if (now - (this.lastForwardedAt ?? this.readyAt) >= (this.timing.keepaliveIntervalMs ?? 5_000)) {
            if (this.send(JSON.stringify({ type: 'keepalive' }))) this.keepalives += 1;
        }
    }

    private reject(category: string, message: string, code = '502'): void {
        if (this.stopped) return;
        // The connection callback logs the queue before disposing it.
        this.fail({ code, category, message });
        this.stop();
    }
}
