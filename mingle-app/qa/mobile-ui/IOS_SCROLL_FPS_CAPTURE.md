# iOS Live Demo Scroll FPS Capture

This harness captures repeatable touch-scroll FPS and jank metrics for the LivePhoneDemo iOS WebView with the deterministic 500-utterance chat scenario.

## Scope

- Target surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`.
- Target device: iPhone 12-class physical iOS device.
- Scenario size: 500 utterances via `window.__MINGLE_QA__.seedScrollPerformanceHistory()`.
- Scroll path: Appium sends native touch gestures into the WebView, while the inner DOM container `[data-qa="live-demo-chat-scroll"]` handles scrolling.
- Measurement path: the harness samples WebView `requestAnimationFrame` timestamps and records FPS, frame interval, jank-frame, long-frame, and estimated dropped-frame metrics.
- App scroll-handler instrumentation remains off. The harness clears `mingleScrollMeasure` and `mingle_live_demo_scroll_measure`, reloads the WebView, and fails if `getLiveDemoChatScrollHandlerMeasurement()` is non-null.

## Required Profile

Use this profile for final pass/fail evidence:

- Hardware: physical iPhone 12-class device, such as iPhone 12, iPhone 12 Pro, or another physical iPhone whose WebDriver window rect is within the accepted iPhone 12-class range.
- Viewport: `viewportMatchesReferenceDevice` must be `true`; the harness accepts a short edge from `390` to `430` CSS px and a long edge from `840` to `940` CSS px.
- Runtime: React Native iOS Debug build with the QA bridge enabled and loaded through the native WebView.
- Services: project devbox `device` profile, with the app pointed at the devbox device URLs.
- Instrumentation: app scroll-handler measurement must be off for the final run. Do not add `?mingleScrollMeasure=chat-scroll-handler`, and do not set `localStorage.mingle_live_demo_scroll_measure`.

A simulator run is allowed only as a development preflight. It must use an iPhone 12-class simulator profile, pass `--allow-simulator` through the runner, and must not be used as final pass/fail evidence.

## Repeatable Procedure

Run every command from the repository root on branch `codex/chat-scroll-performance-plan`.

1. Confirm the connected device UDID.

   ```bash
   xcrun xctrace list devices
   ```

   Use the physical iPhone UDID as `<IOS_REAL_UDID>` below.

2. Prepare dependencies and the device server profile through devbox.

   ```bash
   scripts/devbox bootstrap
   scripts/devbox up --profile device --tunnel-provider cloudflare --with-metro
   ```

   Keep this devbox process running while the device capture runs. If your environment uses ngrok instead of Cloudflare, replace `--tunnel-provider cloudflare` with the project's normal device tunnel provider.

3. Install the iOS Debug app with the QA bridge enabled.

   ```bash
   scripts/devbox mobile --platform ios --ios-configuration Debug --device-app-env dev --qa-bridge --ios-udid <IOS_REAL_UDID>
   ```

   For a clean final run after app or WebView changes, reinstall with:

   ```bash
   scripts/devbox mobile --platform ios --ios-configuration Debug --device-app-env dev --qa-bridge --with-ios-clean-install --ios-udid <IOS_REAL_UDID>
   ```

4. Verify instrumentation is off in Safari Web Inspector before the final capture.

   Open Safari > Develop > the physical iPhone > the Mingle WebView, then run:

   ```js
   ({
     hasMeasurementParam: new URL(location.href).searchParams.has('mingleScrollMeasure'),
     storageValue: localStorage.getItem('mingle_live_demo_scroll_measure'),
     measurement: window.__MINGLE_QA__?.getLiveDemoChatScrollHandlerMeasurement?.() ?? null,
   })
   ```

   Expected result:

   ```js
   {
     hasMeasurementParam: false,
     storageValue: null,
     measurement: null,
   }
   ```

   The harness repeats this check and fails if instrumentation is active. Keep only this FPS capture active for final evidence; do not run the separate `chat-scroll-handler` counter at the same time.

5. Run the final physical-device FPS capture.

   ```bash
   scripts/devbox qa --ios-scroll-fps --ios-real-udid <IOS_REAL_UDID>
   ```

   To repeat with explicit defaults, pass the runner options after `--`:

   ```bash
   scripts/devbox qa --ios-scroll-fps --ios-real-udid <IOS_REAL_UDID> -- --runs 3 --gesture-count 6 --gesture-duration-ms 700 --gesture-pause-ms 250 --min-average-fps 55
   ```

## Simulator Preflight

Simulator preflight is useful for validating setup only. It is not accepted for final performance evidence.

```bash
scripts/devbox qa --ios-scroll-fps --ios-real-udid <IOS_SIM_UDID> -- --allow-simulator
```

The simulator profile should use an iPhone 12-class viewport. The output must still show `viewportMatchesReferenceDevice: true`, but the report should be treated as non-final because it did not run on a physical iPhone.

## Defaults

- Runs: `3`.
- Gestures per run: `6`.
- Gesture duration: `700ms`.
- Gesture pause: `250ms`.
- Capture duration: at least `5200ms`, extended to cover gestures plus settle time.
- Per-run FPS budget: average FPS `>= 55`.
- Minimum frame intervals per run: `120`.
- Target refresh rate for dropped-frame estimates: `60fps`.
- Jank frame threshold: `> 33.4ms`.
- Long frame threshold: `> 50ms`.

## Expected Output

The devbox command prints one JSON object to stdout:

```json
{
  "reportJsonPath": "/path/to/mingle-app/qa/mobile-ui/reports/ios-scroll-fps-<timestamp>/ios-live-demo-scroll-fps.json",
  "reportMarkdownPath": "/path/to/mingle-app/qa/mobile-ui/reports/ios-scroll-fps-<timestamp>/ios-live-demo-scroll-fps.md",
  "summary": {
    "runCount": 3,
    "pass": true,
    "failedRuns": [],
    "averageFpsMean": 58.7,
    "averageFpsMedian": 58.9,
    "averageFpsMin": 57.8,
    "averageFpsMax": 59.4,
    "averageFpsStdDev": 0.66,
    "maxJankRatio": 0.015,
    "maxFrameMs": 41.2,
    "totalEstimatedDroppedFrames": 4,
    "budget": {
      "minAverageFps": 55
    }
  },
  "viewportMatchesReferenceDevice": true,
  "hasFailure": false
}
```

Final evidence passes only when:

- `summary.pass` is `true`.
- `summary.failedRuns` is empty.
- `viewportMatchesReferenceDevice` is `true`.
- `hasFailure` is `false`.
- The JSON report has `instrumentationOff: true`.
- Each run moved the inner DOM scroll container and kept `windowScrollDeltaPx` within `-1` to `1`.

## Report Fields

Each JSON and Markdown report includes:

- Device line and WebDriver window rect.
- Whether the viewport matches the iPhone 12-class reference range.
- Instrumentation-off verification state.
- Per-run before/after inner DOM scroll geometry.
- Average FPS, median/p95/max frame interval, jank frames, long frames, and estimated dropped frames.
- Repeatability summary across runs: FPS mean, median, range, standard deviation, max jank ratio, max frame time, and failed run indexes.

Record final pass/fail evidence in this compact format:

```text
Commit:
Device:
iOS:
Command:
Report JSON:
Report Markdown:
summary.pass:
averageFpsMean / median / min:
maxJankRatio:
maxFrameMs:
totalEstimatedDroppedFrames:
viewportMatchesReferenceDevice:
instrumentationOff:
```

Final pass/fail performance evidence must be collected on the physical reference iPhone with app instrumentation off. This harness makes the touch path and raw metrics repeatable; it does not enable the app's dev-only scroll-handler counter.
