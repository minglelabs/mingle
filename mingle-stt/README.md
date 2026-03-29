# mingle-stt

Standalone STT relay server for Mingle.

## Scripts

- `pnpm dev`: run `stt-server.ts` with `ts-node`
- `pnpm build`: compile to `dist/stt-server.js`
- `pnpm start`: run compiled server

## Environment Variables

- `PORT` (default: `3001`)
- `STT_DEFAULT_MODEL` (optional, default: `soniox`)
- `SONIOX_API_KEY`
- `GLADIA_API_KEY` (optional, for gladia modes)
- `DEEPGRAM_API_KEY` (optional, for deepgram modes)
- `FIREWORKS_API_KEY` (optional, for fireworks mode)
- `SONIOX_MANUAL_FINALIZE_COOLDOWN_MS` (optional, default: `1200`, range: `300..5000`)

The Soniox manual finalize silence window comes from the client session config
(`soniox_manual_finalize_silence_ms`). The server clamps that value to the
`500..3000` range and falls back to `500` when the client does not provide a
valid value. If no new Soniox realtime text arrives during this interval, the
server requests a manual finalize.

`mingle-stt` loads `.env.local` first, then `.env` in this directory.
If these variables are missing, it safely falls back to the defaults above.

Supported values for `STT_DEFAULT_MODEL`:

- `soniox`
- `gladia`
- `gladia-stt`
- `deepgram`
- `deepgram-multi`
- `fireworks`

## Railway

This folder includes `railway.json` and is intended to be used as the Railway
service root directory.
