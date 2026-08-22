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

Soniox segmentation resolves to one effective runtime mode:

- `fin` disables provider endpoint detection and uses the server's manual-finalize
  scheduler. Text that arrives after a finalize request snapshot may be retained
  as provisional carry and reconciled with the next provider tokens.
- `end` enables Soniox semantic endpoint detection. The client session may set
  `soniox_endpoint_max_delay_ms` between `500` and `3000`; sessions that omit it
  use `2000`. Provider `<end>` boundaries never create
  carry state or carry-expiry timers. A manual `<fin>` is still used as a
  carry-free completion barrier when recording stops with pending text.
- `llm` currently resolves to effective `fin` behavior until a dedicated LLM
  segmentation strategy is implemented.

The Soniox manual finalize silence window comes from the client session config
(`soniox_manual_finalize_silence_ms`). The server clamps that value to the
`500..3000` range and falls back to `500` when the client does not provide a
valid value. If no new Soniox realtime text arrives during this interval, the
server requests a manual finalize. Endpoint mode uses the separate
`soniox_endpoint_max_delay_ms` session value so the endpoint preference can be
adjusted per user without changing server-wide environment variables.

`mingle-stt` loads `.env.local` first, then `.env` in this directory.
If these variables are missing, it safely falls back to the defaults above.

## Railway

This folder includes `railway.json` and is intended to be used as the Railway
service root directory.
