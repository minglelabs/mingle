# Android Regression Inventory

This is the current Android-focused validation list derived from [docs/ui-ux-codex-thread-history.md](/Users/nam/.codex/worktrees/a92b/mingle/docs/ui-ux-codex-thread-history.md).

## Current targets

| Target id | Kind | Historical issue atoms | What it validates |
| --- | --- | --- | --- |
| `android-native-stt-reconcile-contracts` | contract | `019d19a3#1`, `019d4eba#1`, `019d4f37#1` | Native STT status and transcript activity still promote the WebView UI back into the running state after background/remount interruptions. |
| `qa-bridge-hydrates-live-demo` | real device | `2026-real-device#1`, `2026-real-device#2` | The Android WebView still hydrates the real live-demo surface and exposes the QA bridge on a locale route. |
| `banner-position-updates-insets` | real device | `019d4cae#11`, `019d4cae#12`, `019d4cae#13`, `019d4cae#14`, `019d4cae#15` | The Android menu still applies top/bottom banner position changes all the way through the native inset bridge. |
| `bottom-anchor-restores-after-storage-hydration` | real device | `019d4cae#23`, `019d4cae#32` | Hydrated transcript history still restores the bottom anchor on Android. |
| `composer-roundtrip-restores-compact-bottom-bar` | real device | `019d4cae#9`, `019d4cae#10` | Android composer growth/shrink still returns the bottom bar to the compact idle height. |
| `empty-state-keeps-single-start-control` | real device | `019d29d5#1` | Android empty-state onboarding still exposes one visible primary start control. |
| `hardware-back-closes-history-overlay` | real device | `019d4cae#4` | The Android hardware back button still drives the same history-close path as the WebView overlay. |
| `native-remount-restores-running-mic-state` | real device | `019d4eba#1`, `019d4f37#1` | After a native WebView remount, Android still restores the red/running mic state instead of falling back to the orange idle/play state. |

## Current notes

- The banner-position case now uses the QA bridge setter so Android inset regressions can be isolated from menu-panel interaction noise on physical devices.
- The native remount case uses a QA-only native status injection so the regression stays deterministic on a physical device without depending on live microphone audio.
- Latest real-device run: `7/8 passed`; `native-remount-restores-running-mic-state` still fails on the connected Android phone.
