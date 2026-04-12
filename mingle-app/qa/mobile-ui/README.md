# Mobile UI Regression QA

This folder contains the mobile UI/UX regression automation derived from [docs/ui-ux-codex-thread-history.md](/Users/nam/.codex/worktrees/a92b/mingle/docs/ui-ux-codex-thread-history.md).

## Scope

The current automation covers the mobile app surface that exists today:

- The React Native shell and native runtime bridge.
- The live translator WebView.
- The `1.1.0` conversations/list/room/navigation surface that now ships on mobile.
- The shipping versioned mobile API aliases used by those surfaces.

The suite splits regressions into:

- Contract regressions validated by Vitest.
- Real mobile regressions validated through Appium on Android devices and iOS simulators/devices.

## Source Of Truth

Future agents should read these in order:

1. [docs/ui-ux-codex-thread-history.md](/Users/nam/.codex/worktrees/a92b/mingle/docs/ui-ux-codex-thread-history.md)
   - Canonical historical issue atom list.
2. [ATOM_CLASSIFICATION.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ATOM_CLASSIFICATION.md)
   - Global `131`-atom classification and union-level automation coverage.
3. [COVERAGE.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/COVERAGE.md)
   - Cross-platform coverage summary.
4. [IOS_REGRESSION_INVENTORY.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/IOS_REGRESSION_INVENTORY.md)
   - Exact iOS target-to-atom mappings.
5. [ANDROID_REGRESSION_INVENTORY.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ANDROID_REGRESSION_INVENTORY.md)
   - Exact Android target-to-atom mappings.
6. [IOS_REGRESSION_BACKLOG.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/IOS_REGRESSION_BACKLOG.md)
   - What is missing from the iOS inventory specifically.
7. [ANDROID_REGRESSION_BACKLOG.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ANDROID_REGRESSION_BACKLOG.md)
   - What is missing from the Android inventory specifically.

## Current Coverage Snapshot

| Coverage view | Validation targets | Explicitly linked atoms |
| --- | --- | --- |
| iOS inventory | `28` | `69 / 131` |
| Android inventory | `27` | `70 / 131` |
| Either mobile platform | `55` | `79 / 131` |

Current union-level classification:

- Automated by at least one mobile suite: `79`
- Current mobile surface, but not automated yet: `44`
- Oracle still unclear: `2`
- Reproduction rule still unclear: `1`
- Deferred or deprioritized: `3`
- Web-only or non-mobile: `2`

## Prerequisites

1. Start local web/STT services through devbox.
2. Keep Metro running for debug mobile builds.
3. Install a debug build on the target Android device or iOS simulator/device.
4. Install Appium-compatible dependencies. The QA runner expects an Appium 3-compatible Node runtime.

Recommended setup from the repository root:

```bash
scripts/devbox bootstrap
scripts/devbox up --profile device --tunnel-provider cloudflare --with-metro
scripts/devbox mobile --platform android --android-variant debug --qa-bridge
scripts/devbox mobile --platform ios --ios-configuration Debug --device-app-env dev --qa-bridge
```

For Appium-backed runs:

- Use `Debug` builds, not `Release` builds.
- Install the app with `--qa-bridge`.
- Use the `device` profile for real-device iOS runs so the WebView uses the tunnel URL instead of `localhost`.

## Commands

Fast contract gate:

```bash
scripts/devbox qa --contracts
```

Android real-device smoke:

```bash
scripts/devbox qa --platform android --android-serial <ANDROID_SERIAL>
```

Expanded Android regression inventory:

```bash
scripts/devbox qa --android-regressions --android-serial <ANDROID_SERIAL>
```

iOS simulator or device smoke:

```bash
scripts/devbox qa --platform ios --ios-udid <IOS_UDID>
```

Expanded iOS regression inventory:

```bash
scripts/devbox qa --ios-regressions --ios-real-udid <IOS_REAL_UDID> --ios-sim-udid <IOS_SIM_UDID>
```

Combined smoke:

```bash
scripts/devbox qa
```

The equivalent `pnpm` commands still exist, but `scripts/devbox qa ...` is the preferred entrypoint for this repository.

## Coverage Areas

Representative categories already automated today:

- Native history/back-availability bridge contracts.
- Conversation-list search/history state.
- Conversation preview ordering, active badges, and row action positioning.
- Conversation routes, versioned aliases, and soft-delete visibility.
- Native safe-area/banner/chrome contracts.
- Live-demo scroll, bubble, copy, locale, auth, menu, and avatar contracts.
- Native STT recovery/reconcile/remount behavior.
- Real-device hydration, bottom-anchor, composer, locale, and empty-state paths.

Use [COVERAGE.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/COVERAGE.md) for the high-level map and the inventory docs for exact target names.

## Classification Vocabulary

The backlog buckets used in [ATOM_CLASSIFICATION.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ATOM_CLASSIFICATION.md) are:

- `Automated by at least one current mobile suite`
- `Current mobile surface, but not automated yet`
- `Oracle still unclear`
- `Reproduction rule still unclear`
- `Deferred or deprioritized`
- `Web-only or non-mobile`

An `oracle` is the measurable pass/fail rule for a bug. Example:

- Clear oracle: "The menu label must be `메뉴` in Korean."
- Unclear oracle: "The transition feels stuttery."

## Maintenance Rule

Whenever a future agent adds or removes a regression target, update these together:

1. The relevant runner script in `mingle-app/scripts/`.
2. The relevant inventory doc.
3. [ATOM_CLASSIFICATION.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ATOM_CLASSIFICATION.md) if atoms moved between backlog buckets.
4. [COVERAGE.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/COVERAGE.md) if the top-level counts changed.
5. [docs/ui-ux-codex-thread-history.md](/Users/nam/.codex/worktrees/a92b/mingle/docs/ui-ux-codex-thread-history.md) if new UI/UX regressions were discovered during QA work.

Reports are written to `mingle-app/qa/mobile-ui/reports/<timestamp>/`.
