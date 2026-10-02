// Coin metering for one STT connection (docs/coin-iap-spec.md 4.2, 5.3).
// mingle-stt has no database: it reports audio seconds to the web server's
// internal charge API every few seconds, and ends the session when that API
// says the balance is exhausted. Billing problems never interrupt speech:
// a failed report is retried with the next chunk.

export const COIN_INSUFFICIENT_ERROR = 'coin_insufficient';
const DEFAULT_SETTLE_INTERVAL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 5_000;
// The charge API caps one chunk; anything above is carried to the next report.
const MAX_SECONDS_PER_REPORT = 120;

export type SttCoinMeterOptions = {
    chargeUrl: string;
    secret: string;
    billingToken: string;
    connectionKey: string;
    sessionKey?: string | null;
    model?: string | null;
    sampleRate: number;
    settleIntervalMs?: number;
    onExhausted: () => void;
    /** The charge API refused the billing token (forged or expired): the session must not continue unbilled. */
    onRejected: () => void;
    fetchImpl?: typeof fetch;
};

export type SttCoinMeter = {
    /** Balance check before any audio is billed; resolves false when the user has no coins. */
    start: () => Promise<boolean>;
    addAudioBytes: (byteLength: number) => void;
    /** Reports what is left and stops the timer. */
    stop: () => Promise<void>;
};

export function readCoinBillingEnv(env: NodeJS.ProcessEnv = process.env): {
    chargeUrl: string;
    secret: string;
    requireToken: boolean;
} | null {
    const chargeUrl = (env.COIN_CHARGE_URL || '').trim();
    const secret = (env.COIN_INTERNAL_SECRET || '').trim();
    if (!chargeUrl || !secret) return null;
    return { chargeUrl, secret, requireToken: env.COIN_STT_REQUIRE_TOKEN === '1' };
}

export function createSttCoinMeter(options: SttCoinMeterOptions): SttCoinMeter {
    const fetchImpl = options.fetchImpl ?? fetch;
    // 16-bit mono PCM.
    const bytesPerSecond = Math.max(1, options.sampleRate) * 2;
    let pendingBytes = 0;
    let chunkIndex = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    let settling: Promise<void> | null = null;
    let exhausted = false;
    let stopped = false;

    const post = async (seconds: number, idempotencyKey: string): Promise<{ ok: boolean; exhausted: boolean }> => {
        try {
            const response = await fetchImpl(options.chargeUrl, {
                method: 'POST',
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                headers: { 'content-type': 'application/json', authorization: `Bearer ${options.secret}` },
                body: JSON.stringify({
                    kind: 'stt',
                    billingToken: options.billingToken,
                    seconds,
                    idempotencyKey,
                    sessionKey: options.sessionKey || undefined,
                    model: options.model || undefined,
                    provider: options.model || undefined,
                }),
            });
            if (response.status === 401) {
                // Only a bad token ends the session. A wrong shared secret is our own
                // misconfiguration and stays fail-open like any other billing outage.
                const failure = await response.json().catch(() => null) as { error?: unknown } | null;
                if (failure?.error === 'invalid_billing_token') markRejected();
                return { ok: false, exhausted: false };
            }
            if (!response.ok) return { ok: false, exhausted: false };
            const body = await response.json() as { balanceExhausted?: unknown };
            return { ok: true, exhausted: body.balanceExhausted === true };
        } catch {
            return { ok: false, exhausted: false };
        }
    };

    const markRejected = () => {
        if (exhausted) return;
        exhausted = true;
        if (timer) clearInterval(timer);
        timer = null;
        options.onRejected();
    };

    const markExhausted = () => {
        if (exhausted) return;
        exhausted = true;
        if (timer) clearInterval(timer);
        timer = null;
        options.onExhausted();
    };

    const settle = async () => {
        const wholeSeconds = Math.min(MAX_SECONDS_PER_REPORT, Math.floor(pendingBytes / bytesPerSecond));
        if (wholeSeconds <= 0) return;
        const bytes = wholeSeconds * bytesPerSecond;
        const index = chunkIndex;
        pendingBytes -= bytes;
        chunkIndex += 1;
        const result = await post(wholeSeconds, `${options.connectionKey}:${index}`);
        if (!result.ok) {
            // Same key on the retry, so a report that did land is not charged twice.
            pendingBytes += bytes;
            chunkIndex = index;
            return;
        }
        if (result.exhausted) markExhausted();
    };

    const settleOnce = () => {
        settling = (settling ?? Promise.resolve()).then(settle).catch(() => undefined);
        return settling;
    };

    return {
        start: async () => {
            const result = await post(0, `${options.connectionKey}:start`);
            if (result.ok && result.exhausted) {
                markExhausted();
                return false;
            }
            // stop() may already have run: the socket can close while the balance check is in flight.
            if (!exhausted && !stopped) {
                timer = setInterval(() => { void settleOnce(); }, options.settleIntervalMs ?? DEFAULT_SETTLE_INTERVAL_MS);
                timer.unref?.();
            }
            return true;
        },
        addAudioBytes: (byteLength) => {
            if (!exhausted && byteLength > 0) pendingBytes += byteLength;
        },
        stop: async () => {
            stopped = true;
            if (timer) clearInterval(timer);
            timer = null;
            // Round the tail up so a short final fragment is still billed as one second.
            if (pendingBytes % bytesPerSecond !== 0 && pendingBytes > 0) {
                pendingBytes += bytesPerSecond - (pendingBytes % bytesPerSecond);
            }
            await settleOnce();
        },
    };
}
