# Mobile UI Regression QA

This folder contains the hybrid mobile QA automation for UI/UX regressions that were previously tracked in `docs/ui-ux-codex-thread-history.md`.

## Scope

The current app surface is a React Native shell around the live translator WebView. Because of that, the suite splits regressions into two buckets:

- Contract regressions caught by unit tests.
- Real mobile regressions caught through Appium on Android devices and iOS simulators/devices.

The first pass covers the regression categories that still exist in the current app:

- iOS WebView back/forward gesture contract.
- Menu locale consistency.
- Native banner position and content inset layout.
- Bottom-anchor restoration after local history hydration.
- Composer growth/shrink round-trip.
- iOS microphone-permission denial recovery.

Older multi-room conversation-list regressions are intentionally not automated here because the current app surface no longer exposes that UI.

See [COVERAGE.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/COVERAGE.md) for the issue-to-test mapping.

## Prerequisites

1. Start the local web and STT servers through devbox.
2. Keep Metro running for debug mobile builds.
3. Install a debug build on the target Android device or iOS simulator/device.

Recommended setup from the repository root:

```bash
scripts/devbox bootstrap
scripts/devbox up --profile local --with-metro
scripts/devbox mobile --platform android --android-variant debug
scripts/devbox up --profile device --device-app-env dev --with-metro
scripts/devbox mobile --platform ios --ios-configuration Debug --device-app-env dev
```

For iOS real-device runs, do not install from the local profile when the app URL points to `127.0.0.1` or `localhost`. Use the device profile so the WebView loads through the tunnel URL and the QA bridge remains reachable from Appium.

## iOS Real-Device WDA Requirements

Real iPhone automation requires Appium to install and launch WebDriverAgent on the phone. On this workstation, the blocker was not the app itself but WDA signing. Before running against a physical iPhone, make sure the items below are true:

- The target phone is visible to Xcode as an online device, not under `Devices Offline`.
- Xcode Accounts has a valid Apple developer account for the team you want Appium to use.
- The latest Apple Developer Program License Agreement has been accepted for that team.
- A local `Apple Development` signing identity exists for the same team ID as `MINGLE_UI_QA_IOS_XCODE_ORG_ID`.
- A provisionable bundle ID is reserved for WDA, passed through `MINGLE_UI_QA_IOS_UPDATED_WDA_BUNDLE_ID`.

Recommended environment for real-device runs:

```bash
export MINGLE_UI_QA_IOS_UDID=<physical-device-udid>
export MINGLE_UI_QA_IOS_XCODE_ORG_ID=<apple-team-id>
export MINGLE_UI_QA_IOS_XCODE_SIGNING_ID='Apple Development'
export MINGLE_UI_QA_IOS_UPDATED_WDA_BUNDLE_ID=<team-owned-wda-bundle-id>
pnpm test:qa:ui:ios -- --ios-udid "$MINGLE_UI_QA_IOS_UDID"
```

The runner now records a failed `session-start` report with direct WDA diagnostics if Appium returns the generic `xcodebuild` code `65` error.

## Commands

Run the contract gate:

```bash
pnpm test:qa:ui:contracts
```

Run Android device QA:

```bash
pnpm test:qa:ui:android -- --android-serial <serial>
```

Run iOS simulator or device QA:

```bash
pnpm test:qa:ui:ios -- --ios-udid <udid>
```

The runner automatically seeds `RCT_jsLocation` for iOS simulators so debug builds attach to the worktree Metro port before Appium connects.

Run both:

```bash
pnpm test:qa:ui
```

The runner writes timestamped reports under `qa/mobile-ui/reports/`.

Today, the most reliable debugging flow is still the per-platform split:

- `pnpm test:qa:ui:android -- --android-serial <serial>`
- `pnpm test:qa:ui:ios -- --ios-udid <udid>`

The combined command is now stable enough to use as a top-level smoke gate after the Android hydration case moved to an app-owned QA bridge instead of raw WebView storage timing.
