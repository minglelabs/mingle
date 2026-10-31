# mingle-voice-agent (POC)

Voice talk with live interpretation, as a proof of concept. Everyone in a
LiveKit room publishes their mic; a server-side **interpreter** joins the same
room as an agent participant, runs each speaker through
Soniox → translation → Gemini TTS, and publishes one interpreted audio track
per listening language (`tr:ko`, `tr:ja`, …). Each client subscribes to the
other people's original audio plus the `tr:<my language>` track and mixes them
locally:

| State | Original voice | Interpretation |
| --- | --- | --- |
| Interpretation on, fixed ducking | 25% (slider) | 100% |
| Interpretation on, dynamic ducking | 15% only while a line plays, else 100% | 100% |
| Interpretation off | 100% | unsubscribed |
| Same language as me | 100% | none |

Because the interpretation arrives as a WebRTC track, the browser's echo
canceller sees it like any other call audio. That is the main reason this runs
through an SFU instead of P2P plus a separate TTS player.

Not wired into `mingle-app` yet: no auth, no DB, no billing. The test page in
`public/` stands in for the app UI.

## Pieces

- `poc-server.ts`: test page, `/api/token` join tokens, one interpreter per
  room (started on the first token request, leaves 30 s after the last person).
  With a local LiveKit it also proxies LiveKit signaling at `/rtc`, so one https
  tunnel serves both the page and signaling.
- `interpreter.ts`: the agent. Per speaker: `AudioStream` (16 kHz) →
  `SonioxStream`. Per finalized line: translate + streaming TTS start right
  away for every language some *other* listener has interpretation on for;
  each language lane plays lines strictly in order. Captions, translations and
  per-line timings go out as data messages on topic `interpreter`.
  - Echo guard: a line that matches what a lane just played, or what another
    speaker just said, within 12 s is dropped as mic pickup instead of being
    re-interpreted.
- `soniox-stream.ts`: Soniox realtime (`stt-rt-v5`, endpoint detection on,
  language hint = speaker's language).
- `translate.ts`: GPT (`gpt-6-luna`, Fast tier, no reasoning) first. If the
  OpenAI key is rejected, it falls back to Gemini `gemini-2.5-flash-lite`
  (Priority tier). A result that isn't written in the target language is
  retried once without context.
- `tts.ts`: Gemini TTS over the Interactions API **streaming** (SSE), with the
  same voices and styles as mingle-app. Leading silence is trimmed.
- `scripts/bench.ts`: headless end to end run (see below).

## Run locally

```bash
brew install livekit
pnpm install
pnpm livekit          # terminal 1: livekit-server --dev (devkey/secret)
pnpm server           # terminal 2: http://localhost:4100
```

Keys come from `.env.local` here, the repo root `.env.local`, or the file named
by `VOICE_POC_ENV_FILE`. From a worktree, point it at the main checkout:
`VOICE_POC_ENV_FILE=~/mingle/.env.local pnpm server`. Needed:
`SONIOX_API_KEY`, `GEMINI_API_KEY`, and optionally `OPENAI_API_KEY` (without a
working one, translation runs on Gemini). The port is `VOICE_POC_PORT`
(default 4100).

### Two phones (same Wi-Fi as the Mac)

iPhone Safari only allows the mic over https:

```bash
ngrok http 4100
```

Open the https URL on two phones, pick different languages, join the same
room. Signaling goes through the tunnel; audio goes over UDP straight to the
Mac's LAN IP (allow incoming connections for `livekit-server` if macOS asks).
Keep "WebAudio로 믹스" on: iOS ignores `<audio>.volume`, so per-track volume
only works through WebAudio.

### LiveKit Cloud (LTE, different networks)

Set `LIVEKIT_URL=wss://<project>.livekit.cloud`, `LIVEKIT_API_KEY`,
`LIVEKIT_API_SECRET`. The page then connects to LiveKit Cloud directly, with
TURN included. No `pnpm livekit` and no `/rtc` proxy are needed.

## Benchmark

```bash
pnpm bench                     # private room, in-process interpreter
BENCH_ROOM=poc pnpm bench      # talk into a room the server interprets (e.g. open in a browser)
```

A speaker bot plays five Korean lines (macOS `say -v Yuna`) in real time. A
listener bot (Japanese, `BENCH_LISTENER_LANG`) records `tr:ja`. The bench
prints the time from the end of each spoken line to the first interpreted
audio the listener receives. The recording is saved to `.cache/bench-ja.wav`.

Results on 2026-10-29 (Mac in Korea, local LiveKit, providers over the
internet, Gemini translation because the local OpenAI key was rejected):

| | median | min | max |
| --- | --- | --- | --- |
| Speech end → interpretation heard | ~2.4 s | 2.1 s | 3.6 s |

Breakdown per line: Soniox endpoint ~0.65 s (two lines took ~1.9 s), translation
~0.8–1.2 s, TTS first audio ~0.7–0.9 s, lane queue 0. Non-streaming TTS
(waiting for the whole clip) put the median at ~3.6 s; streaming cut it to
~2.1–2.5 s.

## Still open (what the POC is for)

- Speakerphone echo on real phones: whether AEC removes the interpreted track,
  and how often the echo guard fires. Check the page's "에코 차단" count.
- iOS Safari per-track volume with WebAudio mixing (fixed and dynamic ducking).
- GPT vs Gemini translation latency and quality (needs a valid `OPENAI_API_KEY`).
- Endpoint tuning: some lines wait ~1.9 s for Soniox's `<end>`
  (`VOICE_SONIOX_MAX_ENDPOINT_DELAY_MS`, default 1500).
- Native app: the RN app would use `@livekit/react-native`, not a WebView, for
  background audio, routing and CallKit.
