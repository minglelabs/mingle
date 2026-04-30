# iOS Live Demo Scroll FPS Capture

This harness captures repeatable touch-scroll FPS and jank metrics for the LivePhoneDemo iOS WebView with the deterministic 500-utterance chat scenario.

## Scope

- Target surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`.
- Target device: iPhone 12-class physical iOS device.
- Scenario size: 500 utterances via `window.__MINGLE_QA__.seedScrollPerformanceHistory()`.
- Scroll path: Appium sends native touch gestures into the WebView, while the inner DOM container `[data-qa="live-demo-chat-scroll"]` handles scrolling.
- Measurement path: the harness samples WebView `requestAnimationFrame` timestamps and records FPS, frame interval, jank-frame, long-frame, and estimated dropped-frame metrics.
- App scroll-handler instrumentation remains off. The harness clears `mingleScrollMeasure` and `mingle_live_demo_scroll_measure`, reloads the WebView, and fails if `getLiveDemoChatScrollHandlerMeasurement()` is non-null.

## Devbox Flow

Prepare the device build and services through devbox:

```bash
scripts/devbox up --profile device --tunnel-provider cloudflare --with-metro
scripts/devbox mobile --platform ios --ios-configuration Debug --device-app-env dev --qa-bridge --ios-udid <IOS_REAL_UDID>
```

Run the capture:

```bash
scripts/devbox qa --ios-scroll-fps --ios-real-udid <IOS_REAL_UDID>
```

The devbox wrapper passes Appium signing settings and writes reports under `mingle-app/qa/mobile-ui/reports/ios-scroll-fps-<timestamp>/`.

## Defaults

- Runs: `3`.
- Gestures per run: `6`.
- Gesture duration: `700ms`.
- Capture duration: at least `5200ms`, extended to cover gestures plus settle time.
- Per-run FPS budget: average FPS `>= 55`.
- Minimum frame intervals per run: `120`.

## Report Fields

Each JSON and Markdown report includes:

- Device line and WebDriver window rect.
- Whether the viewport matches the iPhone 12-class reference range.
- Instrumentation-off verification state.
- Per-run before/after inner DOM scroll geometry.
- Average FPS, median/p95/max frame interval, jank frames, long frames, and estimated dropped frames.
- Repeatability summary across runs: FPS mean, median, range, standard deviation, max jank ratio, max frame time, and failed run indexes.

Final pass/fail performance evidence should still be collected on the physical reference iPhone with app instrumentation off. This harness makes the touch path and raw metrics repeatable; it does not enable the app's dev-only scroll-handler counter.
