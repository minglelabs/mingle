import test from 'node:test';
import assert from 'node:assert/strict';
import { createSttCoinMeter, readCoinBillingEnv } from '../coin-billing';

type Call = { seconds: number; idempotencyKey: string };

function meterFixture(responses: Array<{ ok?: boolean; status?: number; error?: string; balanceExhausted?: boolean } | 'throw'>) {
    const calls: Call[] = [];
    let exhausted = 0;
    let rejected = 0;
    const fetchImpl = (async (_url: unknown, init?: { body?: unknown }) => {
        const body = JSON.parse(String(init?.body));
        calls.push({ seconds: body.seconds, idempotencyKey: body.idempotencyKey });
        const next = responses.shift() ?? {};
        if (next === 'throw') throw new Error('network');
        return {
            ok: next.ok !== false && !next.status,
            status: next.status ?? 200,
            json: async () => ({ balanceExhausted: next.balanceExhausted === true, error: next.error }),
        };
    }) as unknown as typeof fetch;
    const meter = createSttCoinMeter({
        chargeUrl: 'http://app.test/api/internal/coins/charge',
        secret: 's',
        billingToken: 't',
        connectionKey: 'conn',
        sampleRate: 16000,
        settleIntervalMs: 60_000,
        onExhausted: () => { exhausted += 1; },
        onRejected: () => { rejected += 1; },
        fetchImpl,
    });
    return { meter, calls, exhaustedCount: () => exhausted, rejectedCount: () => rejected };
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

test('ends the session when the billing token is refused, but not when our own secret is wrong', async () => {
    const forged = meterFixture([{ status: 401, error: 'invalid_billing_token' }]);
    await forged.meter.start();
    assert.equal(forged.rejectedCount(), 1);

    const misconfigured = meterFixture([{ status: 401, error: 'unauthorized' }]);
    assert.equal(await misconfigured.meter.start(), true);
    assert.equal(misconfigured.rejectedCount(), 0);
    await misconfigured.meter.stop();
});

test('is disabled unless both the charge URL and the secret are set', () => {
    assert.equal(readCoinBillingEnv({}), null);
    assert.equal(readCoinBillingEnv({ COIN_CHARGE_URL: 'http://x' }), null);
    assert.deepEqual(readCoinBillingEnv({ COIN_CHARGE_URL: 'http://x', COIN_INTERNAL_SECRET: 's', COIN_STT_REQUIRE_TOKEN: '1' }), {
        chargeUrl: 'http://x', secret: 's', requireToken: true,
    });
});

test('a connection whose balance is exhausted is told coin_insufficient and closed', async (t) => {
    const { createServer } = await import('node:http');
    const { once } = await import('node:events');
    const { WebSocket, WebSocketServer } = await import('ws');
    const { createSttServer } = await import('../stt-server');

    const charges: Array<Record<string, unknown>> = [];
    const chargeServer = createServer((req, res) => {
        let raw = '';
        req.on('data', (chunk) => { raw += chunk; });
        req.on('end', () => {
            charges.push({ ...JSON.parse(raw), authorization: req.headers.authorization });
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ balanceExhausted: true, error: 'coin_insufficient' }));
        });
    });
    chargeServer.listen(0, '127.0.0.1');
    await once(chargeServer, 'listening');
    const chargePort = (chargeServer.address() as { port: number }).port;

    // A provider that accepts the socket and stays silent.
    const provider = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await once(provider, 'listening');
    const providerPort = (provider.address() as { port: number }).port;

    const { server } = createSttServer({
        sonioxApiKey: 'test',
        sonioxUrl: `ws://127.0.0.1:${providerPort}`,
        coinBilling: { chargeUrl: `http://127.0.0.1:${chargePort}/charge`, secret: 'secret', requireToken: false },
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const sttPort = (server.address() as { port: number }).port;
    t.after(() => { server.close(); chargeServer.close(); provider.close(); });

    const client = new WebSocket(`ws://127.0.0.1:${sttPort}/?coin_token=tok&coin_session=room-1`);
    const messages: Array<Record<string, unknown>> = [];
    client.on('message', (data) => messages.push(JSON.parse(data.toString())));
    await once(client, 'open');
    client.send(JSON.stringify({ sample_rate: 16000, stt_model: 'soniox', languages: ['en'] }));
    const [code] = await once(client, 'close');

    assert.equal(code, 4402);
    assert.ok(messages.some((message) => message.type === 'error' && message.error_code === 'coin_insufficient'));
    assert.equal(charges[0].billingToken, 'tok');
    assert.equal(charges[0].sessionKey, 'room-1');
    assert.equal(charges[0].seconds, 0);
    assert.equal(charges[0].authorization, 'Bearer secret');
});
