# mingle-stt

Standalone STT relay server for Mingle.

## Scripts

- `pnpm dev`: run `stt-server.ts` with `ts-node`
- `pnpm build`: compile to `dist/stt-server.js`
- `pnpm start`: run compiled server

## Environment Variables

- `PORT` (default: `3001`)
- `SONIOX_API_KEY`
- `GLADIA_API_KEY` (optional, for gladia modes)
- `DEEPGRAM_API_KEY` (optional, for deepgram modes)
- `FIREWORKS_API_KEY` (optional, for fireworks mode)
- `SONIOX_SEGMENTATION_STRATEGY` (optional: `fin`, `end`, or `llm`; default: `fin`)
- `SONIOX_MANUAL_FINALIZE_COOLDOWN_MS` (optional, default: `1200`, range: `300..5000`)
- `SONIOX_ENDPOINT_LATENCY_ADJUSTMENT_LEVEL` (optional, default: `0`, range: `0..3`)
- `SONIOX_ENDPOINT_SENSITIVITY` (optional, default: `0`, range: `-1..1`)
- `MINGLE_REALTIME_SECRET` (optional) — shared with mingle-app, authenticates
  direct-message push delivery. See "Conversation event push" below.

## Conversation event push

Direct messages are delivered to an open thread over a small WebSocket
channel here, separate from STT — mingle-app is deployed serverless and
cannot hold a socket open itself, so mingle-app asks this already-persistent
process to do it instead. There is no database involved on this side.

- `GET /conversation-events?token=...` — a client subscribes to one
  conversation. `token` is HMAC-signed by mingle-app under
  `MINGLE_REALTIME_SECRET`, carrying `{ conversationId, userId, exp }`.
  mingle-app checks room membership once, at mint time; this side only checks
  the signature and expiry.
- `POST /conversation-events/publish` — mingle-app calls this right after a
  message is stored, with `Authorization: Bearer <MINGLE_REALTIME_SECRET>`
  and `{ conversationId, messageId }`. Every socket subscribed to that
  conversation gets `{ type: "message", conversationId, messageId }`; the
  client re-fetches the message itself over its normal authenticated route.

Subscriber state is in-memory and per-process, so a restart or redeploy drops
every open connection. This is deliberate: the client already polls on a
slower interval as a fallback, so a dropped push is late by at most one poll,
never lost.

Soniox segmentation resolves to one effective runtime mode:

- `fin` disables provider endpoint detection and uses the server's manual-finalize
  scheduler. Text that arrives after a finalize request snapshot may be retained
  as provisional carry and reconciled with the next provider tokens.
- `end` enables Soniox semantic endpoint detection with a fixed
  `max_endpoint_delay_ms` of `2000`. Provider `<end>` boundaries never create
  carry state or carry-expiry timers. A manual `<fin>` is still used as a
  carry-free completion barrier when recording stops with pending text.
- `llm` currently resolves to effective `fin` behavior until a dedicated LLM
  segmentation strategy is implemented.

The Soniox manual finalize silence window comes from the client session config
(`soniox_manual_finalize_silence_ms`). The server clamps that value to the
`500..3000` range and falls back to `500` when the client does not provide a
valid value. If no new Soniox realtime text arrives during this interval, the
server requests a manual finalize.

`mingle-stt` loads `.env.local` first, then `.env` in this directory.
If these variables are missing, it safely falls back to the defaults above.

## Railway

This folder includes `railway.json` and is intended to be used as the Railway
service root directory.
