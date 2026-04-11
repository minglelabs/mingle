# Mobile UI Regression Coverage

This document maps the still-relevant UI/UX regressions from [docs/ui-ux-codex-thread-history.md](/Users/nam/.codex/worktrees/a92b/mingle/docs/ui-ux-codex-thread-history.md) to the current hybrid mobile QA suite.

For the expanded iOS target list that is executed today, see [IOS_REGRESSION_INVENTORY.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/IOS_REGRESSION_INVENTORY.md). For Android-specific targets, see [ANDROID_REGRESSION_INVENTORY.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ANDROID_REGRESSION_INVENTORY.md). For the remaining unmapped atoms and their backlog classification, see [IOS_REGRESSION_BACKLOG.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/IOS_REGRESSION_BACKLOG.md) and [ANDROID_REGRESSION_BACKLOG.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ANDROID_REGRESSION_BACKLOG.md).

## Covered in the current app surface

The current mobile app surface is the React Native shell plus the live translator WebView. The suite currently covers the regression categories below.

| Regression category | Historical issue atoms | Automated gate |
| --- | --- | --- |
| iPhone WebView hydrates the real live-demo QA bridge | `2026-04-11-real-device-ui-qa-automation` issue atoms 1 and 2 | `pnpm test:qa:ui:ios:regressions` -> `qa-bridge-hydrates-live-demo-real-device` |
| iOS WebView history gesture stays enabled | `019d4cae-5142-7be2-9c74-30f95bfb5787` issue atoms 5 and 43 | `pnpm test:qa:ui:ios:regressions` -> `ios-webview-layout-contracts` |
| iOS native top-tap and banner-clearance bridge logic stays intact | `019d4cae-5142-7be2-9c74-30f95bfb5787` issue atoms 8, 11, 12, 13, 14, 15, and 45 | `pnpm test:qa:ui:ios:regressions` -> `ios-native-ui-bridge-contracts` |
| Current live-demo scroll auto-follow logic stays stable | issue atoms from `019c6f40-5ed2-7933-9acd-9302b505584e` and `019c756e-8522-7eb0-ab7a-f3032bcd29ee` | `pnpm test:qa:ui:ios:regressions` -> `ios-scroll-platform-contracts` |
| Bubble structure, timestamp placement, and translation-final styling stay stable | issue atoms from `019c6f40-5ed2-7933-9acd-9302b505584e`, `019c992c-911f-7b23-8a18-3a0e4d5007df`, and `019d09c4-4bbb-7712-bfff-af784ff51f88` | `pnpm test:qa:ui:ios:regressions` -> `ios-bubble-structure-contracts` |
| Speaker-isolated finalization keeps overlapping speakers from stealing each other's completion state | `019c992c-911f-7b23-8a18-3a0e4d5007df` issue atom 2 | `pnpm test:qa:ui:ios:regressions` -> `ios-native-mic-recovery-contracts` |
| Copy affordances remain lightweight without per-row chrome noise | issue atoms from `019d09c4-4bbb-7712-bfff-af784ff51f88` and `019d5714-6710-7343-b2a8-b4faa797c702` | `pnpm test:qa:ui:ios:regressions` -> `ios-copy-affordance-contracts` |
| Speaker avatar assignment stays deterministic across the trimmed asset set | issue atom `019d162b-4b15-7763-88f2-7571532d1ed6` item 1 | `pnpm test:qa:ui:ios:regressions` -> `ios-speaker-avatar-contracts` |
| Login safe-area fill, terms-step progression, and loading-state gating stay stable | `019ca08b-fcff-7ba3-b22f-d4a11d6203a8` issue atoms 1, 2, and 4 | `pnpm test:qa:ui:ios:regressions` -> `ios-auth-gate-contracts` |
| Native Apple/Google auth routes keep the intended iOS launch path | `019ca08b-fcff-7ba3-b22f-d4a11d6203a8` issue atom 3 | `pnpm test:qa:ui:ios:regressions` -> `ios-native-auth-route-contracts` |
| Top-right language chrome remains recognizable as a dropdown and the drawer stays stable | `019c95e8-00df-7180-8366-54a76bd59ccc` issue atoms 4 and 5, `019d0514-065c-7493-9eb9-ce8c137a0a98` item 1, `019d2f95-6e34-7013-8961-35857fe8f51d` issue atoms 1, 2, and 3, plus `019d43a3-c1e7-7600-858d-64964413a683` item 1 | `pnpm test:qa:ui:ios:regressions` -> `ios-menu-chrome-contracts`, `menu-chrome-keeps-dropdown-cue-and-stable-overlay-real-device` |
| Native mic-permission recovery logic stays retryable and does not stick in error | issue atoms 41 and 42 plus `019d4caf-4787-77f2-9e97-a7695630b6d2` | `pnpm test:qa:ui:ios:regressions` -> `ios-native-mic-recovery-contracts` |
| iOS banner position updates the effective content insets | issue atoms 11, 12, 13, 14, 15 | `pnpm test:qa:ui:ios:regressions` -> `banner-position-updates-insets-real-device` |
| iOS persisted transcript hydration restores the bottom anchor instead of leaving the transcript floating | issue atoms related to restored history and reopen flows, especially 23 and 32 | `pnpm test:qa:ui:ios:regressions` -> `bottom-anchor-restores-after-storage-hydration-real-device` |
| iOS composer growth and collapse restores the compact bottom bar | bottom control bar sizing regressions, especially issue atoms 9 and 10 | `pnpm test:qa:ui:ios:regressions` -> `composer-roundtrip-restores-compact-bottom-bar-real-device` |
| Real-device top-bar chrome keeps the dropdown cue and drawer overlay stable | `019c95e8#4`, `019c95e8#5`, `019d0514#1`, `019d2f95#1`, `019d2f95#2`, `019d2f95#3`, `019d43a3#1` | `pnpm test:qa:ui:ios:regressions` -> `menu-chrome-keeps-dropdown-cue-and-stable-overlay-real-device` |
| Empty-state onboarding keeps one real start control instead of ghost controls | issue atom `019d29d5-7bbe-7660-a135-078eb1403e45` item 1 | `pnpm test:qa:ui:ios:regressions` -> `empty-state-keeps-single-start-control-real-device` |
| Native banner position updates the effective content insets | issue atoms 11, 12, 13, 14, 15 | `pnpm test:qa:ui:android` -> `banner-position-updates-insets` |
| Persisted transcript hydration restores the bottom anchor instead of leaving the transcript floating | issue atoms related to restored history and reopen flows, especially 23 and 32 | `pnpm test:qa:ui:android` -> `bottom-anchor-restores-after-storage-hydration` |
| Composer growth and collapse restores the compact bottom bar | bottom control bar sizing regressions, especially issue atoms 9 and 10 | `pnpm test:qa:ui:android` -> `composer-roundtrip-restores-compact-bottom-bar` |
| Android hardware back still closes the history overlay instead of getting stuck in the RN shell | `019d4cae#4` | `pnpm test:qa:ui:android:regressions` -> `hardware-back-closes-history-overlay` |
| Android native/WebView remount still restores the running mic state after state-split regressions | `019d4eba#1`, `019d4f37#1` | `pnpm test:qa:ui:android:regressions` -> `android-native-stt-reconcile-contracts`, `native-remount-restores-running-mic-state` |
| Android native transcript/status reconcile logic still promotes the UI back into running after background gaps | `019d19a3#1`, `019d4eba#1`, `019d4f37#1` | `pnpm test:qa:ui:android:regressions` -> `android-native-stt-reconcile-contracts` |
| Korean menu label matches the active locale on iOS and the locale catalog stays in sync | issue atoms 21 and 22, plus menu/i18n follow-ups in `019c95e8-00df-7180-8366-54a76bd59ccc` and `019ca08b-fcff-7ba3-b22f-d4a11d6203a8` | `pnpm test:qa:ui:ios:regressions` -> menu-locale and locale-copy targets |
| iOS microphone denial recovers back to idle instead of trapping the UI | issue atoms 41 and 42 | `pnpm test:qa:ui:ios:regressions` -> `permission-denial-recovers-to-idle-simulator` |

## Not covered because the current app no longer exposes that UI

The older multi-room conversations UI from the large RN 1.1.0 thread is not present in the current app surface. Those issue atoms are intentionally excluded from this suite, including:

- conversation-list header sizing and CTA chrome
- room/list drawer transition issues
- room-to-room STT ownership and handoff behavior
- conversation row ordering and preview hydration in the old multi-room list

Those areas should only be re-automated if that product surface returns.

## Current execution guidance

- Use `pnpm test:qa:ui:contracts` as the fast WebView-only contract gate.
- Use `pnpm test:qa:ui:ios:regressions -- --ios-real-udid <physical-udid> --ios-sim-udid <sim-udid>` for the expanded iOS regression inventory.
- Use `pnpm test:qa:ui:android:regressions -- --android-serial <serial>` for the expanded Android regression inventory.
- Use `pnpm test:qa:ui:android -- --android-serial <serial>` for the Android real-device regression pass.
- Use `pnpm test:qa:ui:ios -- --ios-udid <udid>` for the iOS simulator/device regression pass.
- Use `pnpm test:qa:ui` for the combined smoke gate once the local devbox runtime is up.

## Known limitations

- The Android `bottom-anchor-restores-after-storage-hydration` case now uses an app-owned QA bridge to seed the hydrated transcript deterministically. This avoids false negatives from raw WebView local-storage timing, but it is less faithful than a full cold-launch restore.
- Physical iPhone automation still depends on WebDriverAgent real-device signing and an Appium 3-compatible Node runtime. The runner now auto-selects a compatible Node binary for Appium and emits direct WDA diagnostics into the report instead of stopping at Appium's generic `xcodebuild` code `65` message.
