import test from 'node:test';
import assert from 'node:assert/strict';
import { createSttCoinMeter, readCoinBillingEnv } from '../coin-billing';

type Call = { seconds: number; idempotencyKey: string };

function meterFixture(responses: Array<{ ok?: boolean; balanceExhausted?: boolean } | 'throw'>) {
    const calls: Call[] = [];
    let exhausted = 0;
    const fetchImpl = (async (_url: unknown, init?: { body?: unknown }) => {
        const body = JSON.parse(String(init?.body));
        calls.push({ seconds: body.seconds, idempotencyKey: body.idempotencyKey });
        const next = responses.shift() ?? {};
        if (next === 'throw') throw new Error('network');
        return { ok: next.ok !== false, json: async () => ({ balanceExhausted: next.balanceExhausted === true }) };
    }) as unknown as typeof fetch;
    const meter = createSttCoinMeter({
        chargeUrl: 'http://app.test/api/internal/coins/charge',
        secret: 's',
        billingToken: 't',
        connectionKey: 'conn',
        sampleRate: 16000,
        settleIntervalMs: 60_000,
        onExhausted: () => { exhausted += 1; },
        fetchImpl,
    });
    return { meter, calls, exhaustedCount: () => exhausted };
}

test('reports whole audio seconds and rounds the tail up on stop', async () => {
    const { meter, calls } = meterFixture([{}, {}]);
    assert.equal(await meter.start(), true);
    meter.addAudioBytes(32_000 * 2 + 100);
    await meter.stop();
    assert.deepEqual(calls, [
        { seconds: 0, idempotencyKey: 'conn:start' },
        { seconds: 3, idempotencyKey: 'conn:0' },
    ]);
});

test('refuses to start when the balance is already exhausted', async () => {
    const { meter, exhaustedCount } = meterFixture([{ balanceExhausted: true }]);
    assert.equal(await meter.start(), false);
    assert.equal(exhaustedCount(), 1);
});

test('keeps the audio and the chunk key when a report fails, so the retry cannot double charge', async () => {
    const { meter, calls } = meterFixture([{}, 'throw', {}]);
    await meter.start();
    meter.addAudioBytes(32_000);
    await meter.stop();
    meter.addAudioBytes(32_000);
    await meter.stop();
    assert.deepEqual(calls.slice(1), [
        { seconds: 1, idempotencyKey: 'conn:0' },
        { seconds: 2, idempotencyKey: 'conn:0' },
    ]);
});

test('signals exhaustion once when a charge empties the balance', async () => {
    const { meter, exhaustedCount } = meterFixture([{}, { balanceExhausted: true }]);
    await meter.start();
    meter.addAudioBytes(32_000);
    await meter.stop();
    assert.equal(exhaustedCount(), 1);
});

test('is disabled unless both the charge URL and the secret are set', () => {
    assert.equal(readCoinBillingEnv({}), null);
    assert.equal(readCoinBillingEnv({ COIN_CHARGE_URL: 'http://x' }), null);
    assert.deepEqual(readCoinBillingEnv({ COIN_CHARGE_URL: 'http://x', COIN_INTERNAL_SECRET: 's', COIN_STT_REQUIRE_TOKEN: '1' }), {
        chargeUrl: 'http://x', secret: 's', requireToken: true,
    });
});
