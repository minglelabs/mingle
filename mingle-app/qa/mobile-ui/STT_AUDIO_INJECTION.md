# STT Audio Injection QA

Tests speech recognition and translation in the real app without anyone
speaking. A QA-bridge build replaces the microphone's samples with a golden
WAV fixture inside the native STT module, so everything after the microphone
(WebSocket framing, STT server, segmentation, translation, persistence, UI)
runs exactly as in production.

## How it works

1. `window.__MINGLE_QA__.qaInjectAudio({ fixtureId, url, leadingSilenceMs, trailingSilenceMs })`
   posts `native_qa_inject_audio` to the RN shell.
2. The RN shell calls `NativeSTTModule.qaInjectAudio`, which downloads and
   decodes the WAV and arms it.
3. While armed, every microphone buffer keeps its size and timing, but its
   samples are replaced: leading silence → fixture (resampled to the capture
   rate) → trailing silence → silence until the STT session stops. A fixture
   armed while STT is idle starts with the next session; one armed during a
   session starts on the next buffer.
4. Milestones (`armed`, `started`, `speech_started`, `speech_ended`,
   `finished`, `cleared`, `error`) with wall-clock `atMs` are appended to
   `window.__MINGLE_QA_AUDIO_INJECTION_EVENTS__` and dispatched as the
   `mingle:native-qa-audio-injection` window event.

`window.__MINGLE_QA__.qaClearAudioInjection()` restores the microphone.

## Gating

The path is reachable only when every layer agrees:

| Layer | Check |
| --- | --- |
| Web | `__MINGLE_QA__` exists only with `qa=1&nativeQa=1&sttDebug=1&ttsDebug=1` and the native runtime authority flag (`shouldExposeNativeQaBridge`). |
| RN shell | `native_qa_inject_audio` is ignored unless `RUNTIME_QA_BRIDGE_ENABLED`. |
| iOS native | `MingleQaBridgeEnabled == "1"` in Info.plist **and** the install has an embedded provisioning profile (simulator, development or ad-hoc) — App Store and TestFlight installs are refused. |
| Android native | `BuildConfig.MINGLE_QA_BRIDGE_ENABLED == "1"` **and** the app is debuggable — Play Store rejects debuggable builds. |

Store builds are produced without `--qa-bridge`, so the flag is `0` there.

## Golden fixtures

See [test-fixtures/audio/README.md](../../test-fixtures/audio/README.md).
`pnpm qa:audio:golden` renders `test-fixtures/audio/golden/manifest.json`
into `test-fixtures/audio/local/golden/*.wav`.

## Metrics run

```bash
# iOS simulator (QA-bridge build, signed in, devbox servers up)
pnpm test:qa:stt-audio -- --ios-udid <SIMULATOR_UDID>

# Subset, longer trailing silence
pnpm test:qa:stt-audio -- --ios-udid <UDID> --fixtures ko-greeting-01,en-meeting-01 --trailing-silence-ms 4000

# Android device/emulator (the fixture port is forwarded with adb reverse)
pnpm test:qa:stt-audio -- --platform android --android-serial <SERIAL>

# Physical iPhone: serve fixtures on the LAN
pnpm test:qa:stt-audio -- --ios-udid <UDID> --fixture-host <MAC_LAN_IP>

# Re-score a saved run (e.g. once DATABASE_URL is available)
pnpm test:qa:stt-audio -- --evaluate-run qa/mobile-ui/reports/stt-audio/<run>/run.json
```

The runner serves the WAVs over HTTP (`--fixture-port`, default 4599), opens
an Appium session with the regular mobile UI QA helpers, enters a
conversation room, starts the mic, and plays each fixture in the same STT
session. It waits for the fixture to finish and for its translated turn to
appear before arming the next one.

Scoring:

- **CER** for every fixture (whitespace ignored, so Korean spacing differences
  do not count); **WER** additionally for word languages (en, es).
  Punctuation and case are ignored, and the closest of `transcript` /
  `acceptedTranscripts` is used.
- **Latency** from the native `speech_ended` timestamp to
  - `speechEndToSttFinalized`: the `stt_turn_finalized` row's `created_at` in
    `app_event_logs` (source text delivered),
  - `speechEndToTranslationLogged`: that row's `updated_at` once the
    translation update rewrote it,
  - `speechEndToTranslationObserved`: when the runner saw the translated turn
    in the WebView (polled every ~150 ms).
- Language mismatches, missing translations, and split turns are reported as
  warnings; no transcript or an injection error fails the fixture.

`app_event_logs` is read with plain Prisma reads from `--database-url`,
`MINGLE_QA_DATABASE_URL` or `DATABASE_URL` (the package script loads
`.env.local`). Without a database URL the run still scores the WebView
transcript and observed latency.

Reports land in `qa/mobile-ui/reports/stt-audio/<timestamp>/` (`run.json`,
`report.json`, `report.md`).

## Caveats

- Capture still runs, so the app still needs microphone permission (the
  runner grants it on simulators and Android).
- The simulator's capture rate follows the Mac's input device; the fixture is
  resampled to whatever rate the tap delivers.
- Device and server clocks are compared directly. On a simulator they are the
  same clock; on physical devices expect NTP-level skew (tens of ms).
- Native timestamps are taken from the capture buffer's host time, so
  `speech_ended` is accurate to within one buffer (~40–100 ms).
