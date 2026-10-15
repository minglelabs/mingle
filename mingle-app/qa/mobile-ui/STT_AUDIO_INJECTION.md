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

# Physical iPhone: run devbox on the LAN (`scripts/devbox up --profile local --host <MAC_LAN_IP>`),
# install with `scripts/devbox mobile --profile local --host <MAC_LAN_IP> --platform ios --ios-udid <UDID> --ios-configuration Release --qa-bridge`,
# then serve fixtures on the LAN as well
MINGLE_UI_QA_IOS_XCODE_ORG_ID=<TEAM_ID> MINGLE_UI_QA_IOS_XCODE_SIGNING_ID="Apple Development" \
MINGLE_UI_QA_IOS_UPDATED_WDA_BUNDLE_ID=com.minglelabs.mingle.rn.WebDriverAgentRunner \
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
  - `speechEndToTranslationLogged`: when the message's `TRANSLATION_FINAL`
    rows were inserted (`app_message_contents.created_at`). `updated_at` is
    not used: rows rewritten by raw SQL get the database's local time there
    (the dev database runs in `Asia/Seoul`, which shifts it by +9 h),
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

## Verified run — iPhone 14, iOS 26.6.2 (2026-10-15)

QA Release build on a physical iPhone over the LAN devbox, all ten golden
fixtures in one STT session, scored from the local dev database:

| Fixture | CER | WER | Speech end → STT final | → translation (DB) | → translation (UI) |
| --- | --- | --- | --- | --- | --- |
| ko-greeting-01 | 0% | — | 3746 ms | 5004 ms | 4910 ms |
| ko-directions-01 | 0% | — | 4007 ms | 5763 ms | 5640 ms |
| en-restaurant-01 | 0% | 0% | 889 ms | 2788 ms | 2640 ms |
| en-meeting-01 | 0% | 0% | 920 ms | 1861 ms | 1682 ms |
| ja-shopping-01 | 0% | — | 905 ms | 2126 ms | 2045 ms |
| ja-hotel-01 | 0% | — | 609 ms | 1799 ms | 1773 ms |
| zh-taxi-01 | 0% | — | 1083 ms | 2182 ms | 1729 ms |
| zh-price-01 | 0% | — | 589 ms | 2040 ms | 1983 ms |
| es-airport-01 | 0% | 0% | 971 ms | 1876 ms | 1994 ms |
| es-weather-01 | 0% | 0% | 800 ms | 1629 ms | 1611 ms |
| **Median** | | | **913 ms** | **2083 ms** | **1989 ms** |

- Synthetic voices recorded clean are an easy case; 0% error is the expected
  baseline, not evidence of accuracy on real speech. Add noisy or accented
  recordings under `local/` to make the set discriminating.
- Korean turns finalize about 3 s later than every other language (3.7–4.0 s
  versus 0.6–1.1 s after the end of speech), which is worth a look in the
  segmentation settings.
- The DB-logged and WebView-observed translation times agree within
  ~100–450 ms, which cross-checks both timing sources.

## Caveats

- Capture still runs, so the app still needs microphone permission (the
  runner grants it on simulators and Android, and accepts the iOS alert on a
  physical iPhone).
- A physical iPhone reaches the LAN devbox only after Mingle is allowed
  local network access; a fresh install asks again and loses the sign-in.
- The simulator's capture rate follows the Mac's input device; the fixture is
  resampled to whatever rate the tap delivers.
- Device and server clocks are compared directly. On a simulator they are the
  same clock; on physical devices expect NTP-level skew (tens of ms).
- Native timestamps are taken from the capture buffer's host time, so
  `speech_ended` is accurate to within one buffer (~40–100 ms).
