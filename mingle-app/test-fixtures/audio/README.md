## Live STT Audio Fixtures

Live integration tests are opt-in and run via `pnpm test:live` (or `pnpm test:all`).
These tests stream WAV fixtures to the local STT WebSocket server.

Default fixture directory:

- `test-fixtures/audio/fixtures/`
- `test-fixtures/audio/local/` (local-only, git ignored)

How fixture selection works:

- All files under both fixture directories are scanned.
- `.wav` files are parsed directly (PCM 16-bit mono required).
- `.m4a` and other supported formats are transcoded via `ffmpeg` (fallback: macOS `afconvert`).
- Unsupported extensions or failed transcodes are skipped with a warning.
- At least one valid file must exist, or the live test fails.
- Stream pacing default is real-time (`40ms chunk / 40ms send delay`).

You can override fixture source with:

- `MINGLE_TEST_AUDIO_FIXTURE=/absolute/path/to/fixture.wav`
- `MINGLE_TEST_AUDIO_FIXTURE_DIR=/absolute/path/to/fixtures-dir`
- `MINGLE_TEST_TARGET_LANGUAGES=ko,en` (optional override)
- `MINGLE_TEST_TTS_LANGUAGE=ko` (optional override)
- `MINGLE_TEST_TTS_OUTPUT_DIR=/absolute/path/to/tts-output`

Required fixture format:

- Direct WAV input: RIFF/WAVE, PCM 16-bit, mono (1 channel)
- Transcoded inputs (e.g. `.m4a`) are converted to the same format during test

### Runtime outputs

- Soniox final transcript and finalize translations are printed to test stdout.
- Returned TTS audio is saved under `test-fixtures/audio/local/tts-output/` by default.

### Git policy (recommended)

- Commit one short, sanitized baseline fixture under `test-fixtures/audio/fixtures/` for team reproducibility.
- Put personal or sensitive recordings under `test-fixtures/audio/local/` (ignored by git).
- Keep fixture length short (about 2-6 seconds) to reduce test runtime and flakiness.

### Optional env vars

- `MINGLE_TEST_WS_URL` (default: `ws://127.0.0.1:3001`)
- `MINGLE_TEST_API_BASE_URL` (default: `http://127.0.0.1:3000`)
- `MINGLE_TEST_EXPECTED_PHRASE` (asserts recognized text contains this phrase)
- Audio/server regression E2E runs through `pnpm test:live`.
- iOS device-only tests are enabled only through env flags:
  - `MINGLE_TEST_IOS_HEALTHCHECK=1`
  - `MINGLE_TEST_IOS_TTS_EVENT_E2E=1`

## Golden set for QA audio injection

`golden/manifest.json` lists short ko/en/ja/zh/es utterances with ground-truth
transcripts (plus accepted alternatives such as `3` vs `three`) and reference
translations. Only the manifest is committed. The audio is rendered locally
with the macOS voices named in the manifest:

```bash
pnpm qa:audio:golden            # writes test-fixtures/audio/local/golden/<id>.wav (git ignored)
pnpm qa:audio:golden --force    # re-render after changing a transcript or voice
```

Each WAV is 16 kHz, 16-bit mono and trimmed to the speech, so the end of the
file is the end of speech. `local/golden/index.json` records each file's
duration and voice. The existing `local/tts-output/` clips are translation TTS
outputs without a recorded source transcript, so they cannot serve as ground
truth; to add a real recording, put it under `local/` and add a manifest entry
with its transcript.

These files feed the QA-only microphone substitute in the native STT modules
(`MingleQaAudioInjector` on iOS, `NativeSttQaAudioInjector` on Android). In a
QA-bridge build, `window.__MINGLE_QA__.qaInjectAudio({ fixtureId, url })`
makes the running (or next) STT session send the fixture instead of
microphone samples, at the microphone's own pace and chunk size, and then
silence until the session stops. `pnpm test:qa:stt-audio` drives that through
Appium and reports CER/WER and latency; see
[qa/mobile-ui/STT_AUDIO_INJECTION.md](../../qa/mobile-ui/STT_AUDIO_INJECTION.md).
