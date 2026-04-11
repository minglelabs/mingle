# Mobile UI Regression Coverage

This document maps the still-relevant UI/UX regressions from [docs/ui-ux-codex-thread-history.md](/Users/nam/.codex/worktrees/a92b/mingle/docs/ui-ux-codex-thread-history.md) to the current hybrid mobile QA suite.

## Covered in the current app surface

The current mobile app surface is the React Native shell plus the live translator WebView. The suite currently covers the regression categories below.

| Regression category | Historical issue atoms | Automated gate |
| --- | --- | --- |
| iOS WebView history gesture stays enabled | `019d4cae-5142-7be2-9c74-30f95bfb5787` issue atoms 5 and 43 | `pnpm test:qa:ui:contracts` |
| Native banner position updates the effective content insets | issue atoms 11, 12, 13, 14, 15 | `pnpm test:qa:ui:android` -> `banner-position-updates-insets` |
| Persisted transcript hydration restores the bottom anchor instead of leaving the transcript floating | issue atoms related to restored history and reopen flows, especially 23 and 32 | `pnpm test:qa:ui:android` -> `bottom-anchor-restores-after-storage-hydration` |
| Composer growth and collapse restores the compact bottom bar | bottom control bar sizing regressions, especially issue atoms 9 and 10 | `pnpm test:qa:ui:android` -> `composer-roundtrip-restores-compact-bottom-bar` |
| Korean menu label matches the active locale on iOS | issue atoms 21 and 22 | `pnpm test:qa:ui:ios` -> `menu-label-matches-korean-locale` |
| iOS microphone denial recovers back to idle instead of trapping the UI | issue atoms 41 and 42 | `pnpm test:qa:ui:ios` -> `permission-denial-recovers-to-idle` |

## Not covered because the current app no longer exposes that UI

The older multi-room conversations UI from the large RN 1.1.0 thread is not present in the current app surface. Those issue atoms are intentionally excluded from this suite, including:

- conversation-list header sizing and CTA chrome
- room/list drawer transition issues
- room-to-room STT ownership and handoff behavior
- conversation row ordering and preview hydration in the old multi-room list

Those areas should only be re-automated if that product surface returns.

## Current execution guidance

- Use `pnpm test:qa:ui:contracts` as the fast contract gate.
- Use `pnpm test:qa:ui:android -- --android-serial <serial>` for the Android real-device regression pass.
- Use `pnpm test:qa:ui:ios -- --ios-udid <udid>` for the iOS simulator/device regression pass.
- Use `pnpm test:qa:ui` for the combined smoke gate once the local devbox runtime is up.

## Known limitations

- The Android `bottom-anchor-restores-after-storage-hydration` case now uses an app-owned QA bridge to seed the hydrated transcript deterministically. This avoids false negatives from raw WebView local-storage timing, but it is less faithful than a full cold-launch restore.
- Physical iPhone automation still depends on WebDriverAgent real-device signing and an Appium 3-compatible Node runtime. The runner now auto-selects a compatible Node binary for Appium and emits direct WDA diagnostics into the report instead of stopping at Appium's generic `xcodebuild` code `65` message.
