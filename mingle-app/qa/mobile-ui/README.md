# Mobile UI Regression QA

This folder contains the hybrid mobile QA automation for UI/UX regressions that were previously tracked in `docs/ui-ux-codex-thread-history.md`.

## Scope

The current app surface is a React Native shell around the live translator WebView. Because of that, the suite splits regressions into two buckets:

- Contract regressions caught by unit tests.
- Real mobile regressions caught through Appium on Android devices and iOS simulators/devices.

The first pass covers the regression categories that still exist in the current app:

- iOS WebView back/forward gesture contract.
- Login safe-area fill, terms-step progression, and loading-state gating.
- Native Apple/Google auth route wiring for the iOS launch path.
- Bubble structure, timestamp placement, and lightweight copy affordances.
- Speaker-isolated STT finalization.
- Deterministic speaker avatars.
- Top-right dropdown/menu chrome and drawer overlay stability.
- Menu locale consistency.
- Native banner position and content inset layout.
- Bottom-anchor restoration after local history hydration.
- Composer growth/shrink round-trip.
- Empty-state onboarding guidance without a ghost start control.
- iOS microphone-permission denial recovery.
- Android shared WebView/auth/menu/bubble contracts that still apply to the current RN shell.
- Android native/WebView remount recovery on a physical device.

Older multi-room conversation-list regressions are intentionally not automated here because the current app surface no longer exposes that UI.

See [COVERAGE.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/COVERAGE.md) for the issue-to-test mapping, [IOS_REGRESSION_INVENTORY.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/IOS_REGRESSION_INVENTORY.md) for the expanded iOS validation list, [ANDROID_REGRESSION_INVENTORY.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ANDROID_REGRESSION_INVENTORY.md) for the Android-focused inventory, and [ANDROID_REGRESSION_BACKLOG.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ANDROID_REGRESSION_BACKLOG.md) for the remaining Android backlog classification.

## Prerequisites

1. Start the local web and STT servers through devbox.
2. Keep Metro running for debug mobile builds.
3. Install a debug build on the target Android device or iOS simulator/device.
4. Use an Appium 3-compatible Node runtime for the automation stack. The runner now auto-falls back to `/opt/homebrew/opt/node@22/bin/node` when the shell `node` is too old for Appium 3.

Recommended setup from the repository root:

```bash
scripts/devbox bootstrap
scripts/devbox up --profile local --with-metro
scripts/devbox mobile --platform android --android-variant debug --qa-bridge
scripts/devbox up --profile device --device-app-env dev --with-metro
scripts/devbox mobile --platform ios --ios-configuration Debug --device-app-env dev --qa-bridge
```

For iOS real-device runs, do not install from the local profile when the app URL points to `127.0.0.1` or `localhost`. Use the device profile so the WebView loads through the tunnel URL and the QA bridge remains reachable from Appium.

For iOS real-device Appium runs, install a `Debug` build. The current RN shell enables iOS WebView debugging only in debug builds, so a `Release` build will not expose the QA WebView context to Appium on a physical phone.

For both iOS and Android Appium runs, install the app with `--qa-bridge`. The QA bridge is no longer enabled in every debug build by default.

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

On iOS 26 real devices, the current runner also expects an Appium 3 stack with a current `xcuitest` driver. Older `Appium 2.x + xcuitest 8.x` builds can expose the WebView context but still fail every `title`/`execute` call with `code=-32601` and `"'Runtime' domain was not found"`.

## Commands

Run the contract gate:

```bash
pnpm test:qa:ui:contracts
```

Or through devbox:

```bash
scripts/devbox qa --contracts
```

Run Android device QA:

```bash
pnpm test:qa:ui:android -- --android-serial <serial>
```

Run the expanded Android regression inventory:

```bash
pnpm test:qa:ui:android:regressions -- --android-serial <serial>
```

The expanded Android suite now runs both shared contract targets and physical-device checks. The current reference run covers `21` validation targets mapped to `49` historical issue atoms.

Run iOS simulator or device QA:

```bash
pnpm test:qa:ui:ios -- --ios-udid <udid>
```

Or through devbox:

```bash
scripts/devbox qa --platform ios --ios-udid <udid>
```

Or through devbox for the expanded Android regression inventory:

```bash
scripts/devbox qa --android-regressions --android-serial <serial>
```

Run the expanded iOS regression inventory:

```bash
pnpm test:qa:ui:ios:regressions -- --ios-real-udid <physical-udid> --ios-sim-udid <sim-udid>
```

Or through devbox:

```bash
scripts/devbox qa --ios-regressions --ios-real-udid <physical-udid> --ios-sim-udid <sim-udid>
```

On physical iPhones, the current suite now runs the QA-bridge hydration, banner inset, persisted-history hydration, composer round-trip, top-bar chrome/drawer stability, locale/menu regressions, and empty-state guidance checks. The microphone permission-denial regression remains simulator-only because `xcrun simctl privacy` cannot revoke permissions on a real device.

The runner automatically seeds `RCT_jsLocation` for iOS simulators so debug builds attach to the worktree Metro port before Appium connects.

Run both:

```bash
pnpm test:qa:ui
```

Or through devbox:

```bash
scripts/devbox qa
```

The runner writes timestamped reports under `qa/mobile-ui/reports/`.

Today, the most reliable debugging flow is still the per-platform split:

- `pnpm test:qa:ui:android -- --android-serial <serial>`
- `pnpm test:qa:ui:ios -- --ios-udid <udid>`

The combined command is now stable enough to use as a top-level smoke gate after the Android hydration case moved to an app-owned QA bridge instead of raw WebView storage timing.

The devbox wrapper does not replace `scripts/devbox up` or `scripts/devbox mobile`. Keep using devbox to start the device profile/tunnel and install the debug app first, then use `scripts/devbox qa ...` to launch the QA runner itself. For Appium-backed runs, the install step should use `--qa-bridge`.

## Devbox QA Command Matrix

From the repository root:

```bash
# Fast cross-platform contract gate
scripts/devbox qa --contracts

# Standard Android physical-device QA
scripts/devbox qa --platform android --android-serial <ANDROID_SERIAL>

# Expanded Android regression inventory
scripts/devbox qa --android-regressions --android-serial <ANDROID_SERIAL>

# Standard iOS simulator or device QA
scripts/devbox qa --platform ios --ios-udid <IOS_UDID>

# Expanded iOS regression inventory
scripts/devbox qa --ios-regressions --ios-real-udid <IOS_REAL_UDID> --ios-sim-udid <IOS_SIM_UDID>

# Standard combined smoke
scripts/devbox qa
```

Use `scripts/devbox up ...` and `scripts/devbox mobile ... --qa-bridge` first when the local servers, tunnel, Metro, or debug app install are not already in the expected state.

## Coverage Snapshot

Current documented history size and explicit automation coverage:

| Platform | Validation targets | Historical atoms explicitly linked in inventory | Backlog doc |
| --- | --- | --- | --- |
| iOS | `23` | `47 / 92` | [IOS_REGRESSION_BACKLOG.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/IOS_REGRESSION_BACKLOG.md) |
| Android | `21` | `49 / 92` | [ANDROID_REGRESSION_BACKLOG.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ANDROID_REGRESSION_BACKLOG.md) |

Use [COVERAGE.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/COVERAGE.md) for the cross-platform mapping and use the inventory/backlog documents for exact per-atom accounting.

## Issue Classification

The historical atom source is always [docs/ui-ux-codex-thread-history.md](/Users/nam/.codex/worktrees/a92b/mingle/docs/ui-ux-codex-thread-history.md).

Atoms that are not currently automated are classified into the backlog buckets below:

- `Legacy surface removed`: old multi-room/list/drawer UI that the current mobile shell no longer exposes.
- `Current surface, but not automated yet`: still relevant to the current app surface and should be the next automation candidates.
- `Likely already covered semantically, but not backlinked yet`: behavior is effectively checked, but the historical atom link is missing from the inventory docs.
- `Oracle still unclear`: the bug is understood, but the pass/fail rule is not measurable enough yet.
- `Reproduction rule still unclear`: the history entry is too blended or meta to replay as one clean regression.
- `Deferred or deprioritized`: known issue, but intentionally outside the active automation queue for now.
- `Web-only or platform-specific`: intentionally out of scope for the other platform.

The exact atom lists for each bucket live in:

- [IOS_REGRESSION_BACKLOG.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/IOS_REGRESSION_BACKLOG.md)
- [ANDROID_REGRESSION_BACKLOG.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ANDROID_REGRESSION_BACKLOG.md)

## Source Of Truth For Future Agents

These files are the maintenance chain for the mobile regression suite:

1. [docs/ui-ux-codex-thread-history.md](/Users/nam/.codex/worktrees/a92b/mingle/docs/ui-ux-codex-thread-history.md)
   - Canonical historical issue atom list.
2. [COVERAGE.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/COVERAGE.md)
   - Cross-platform mapping from historical atoms to current automated gates.
3. [IOS_REGRESSION_INVENTORY.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/IOS_REGRESSION_INVENTORY.md)
   - Executed iOS targets, per-target atom links, and current coverage count.
4. [ANDROID_REGRESSION_INVENTORY.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ANDROID_REGRESSION_INVENTORY.md)
   - Executed Android targets, per-target atom links, and current coverage count.
5. [IOS_REGRESSION_BACKLOG.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/IOS_REGRESSION_BACKLOG.md)
   - iOS atoms still outside the inventory, grouped by reason.
6. [ANDROID_REGRESSION_BACKLOG.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ANDROID_REGRESSION_BACKLOG.md)
   - Android atoms still outside the inventory, grouped by reason.
7. `qa/mobile-ui/reports/<timestamp>/`
   - Latest execution results, pass/fail counts, and device-specific diagnostics.

The code entrypoints that future agents should edit when extending the suite are:

- [scripts/devbox.sh](/Users/nam/.codex/worktrees/a92b/mingle/scripts/devbox.sh)
- [scripts/mobile-ui-qa.mjs](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/scripts/mobile-ui-qa.mjs)
- [scripts/ios-ui-regression-suite.mjs](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/scripts/ios-ui-regression-suite.mjs)
- [scripts/android-ui-regression-suite.mjs](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/scripts/android-ui-regression-suite.mjs)

## Maintenance Rule

When a future agent adds or removes a regression target, update these together:

1. The relevant runner script.
2. The relevant inventory document.
3. The relevant backlog document if atoms moved buckets.
4. [COVERAGE.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/COVERAGE.md) if the high-level mapping changed.
5. [docs/ui-ux-codex-thread-history.md](/Users/nam/.codex/worktrees/a92b/mingle/docs/ui-ux-codex-thread-history.md) if a newly discovered UI/UX issue was found during QA work.
