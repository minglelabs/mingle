# Android Regression Inventory

This inventory expands the Android side of the mobile UI regression suite so the current automation is no longer just a handful of real-device smoke checks.

- Historical issue atoms in [docs/ui-ux-codex-thread-history.md](/Users/nam/.codex/worktrees/a92b/mingle/docs/ui-ux-codex-thread-history.md): `92`
- Current automated Android validation targets: `21`
- Historical issue atoms explicitly linked to the Android inventory: `49`
- These targets cover the current React Native shell plus the live-demo/auth WebView surface on Android.

## Executed by `pnpm test:qa:ui:android:regressions`

| Validation target | Mode | Historical issue atoms | Gate |
| --- | --- | --- | --- |
| `android-native-ui-bridge-contracts` | contract | `019d4cae#11`, `019d4cae#12`, `019d4cae#13`, `019d4cae#14`, `019d4cae#15` | `src/components/LivePhoneDemo/live-phone-demo.native-ui.logic.test.ts` |
| `android-scroll-platform-contracts` | contract | `019c6f40#1`, `019c6f40#2`, `019c756e#1`, `019d18f2#1` | `src/components/LivePhoneDemo/live-phone-demo.scroll.logic.test.ts` |
| `android-composer-layout-contracts` | contract | `019d4cae#9`, `019d4cae#10`, `019d6d6d#1`, `019d6d99#1` | `src/components/LivePhoneDemo/live-phone-demo.composer.logic.test.ts` |
| `android-preference-hydration-contracts` | contract | `019d4cae#23`, `019d4cae#32`, `019d2a13#1`, `019d2a3f#1` | `src/components/LivePhoneDemo/live-phone-demo.preferences.test.ts`, `src/components/LivePhoneDemo/live-phone-demo.account-preferences.test.ts` |
| `android-locale-catalog-contracts` | contract | `019d4cae#21`, `019d4cae#22`, `019c95e8#2`, `019c95e8#3`, `019ca08b#5`, `019ca08b#6` | `src/i18n/config.test.ts`, `src/i18n/get-dictionary.test.ts` |
| `android-localized-surface-copy-contracts` | contract | `019d4cae#21`, `019d4cae#22`, `019c95e8#1`, `019c95e8#2`, `019c95e8#3`, `019ca08b#5`, `019ca08b#6`, `019ca08b#7` | `live-phone-demo.feedback-copy`, `delete-copy`, `copy-actions`, `tts-actions`, `app-update.logic` tests |
| `android-bubble-structure-contracts` | contract | `019c6f40#3`, `019c992c#1`, `019d09c4#1` | `chat-bubble`, `chat-bubble.timestamp`, `translation-bubble-row` tests |
| `android-copy-affordance-contracts` | contract | `019d09c4#1`, `019d5714#1` | `copyable-bubble-surface`, `copyable-bubble-surface.logic`, `live-phone-demo.copy` tests |
| `android-speaker-avatar-contracts` | contract | `019d162b#1` | `speaker-avatar` tests |
| `android-auth-gate-contracts` | contract | `019ca08b#1`, `019ca08b#2`, `019ca08b#4` | `src/components/mingle-home.auth-contract.test.ts` |
| `android-native-auth-route-contracts` | contract | `019ca08b#3` | `src/lib/native-auth-bridge.test.ts`, `src/app/[locale]/auth/signin/page.test.ts`, `src/app/[locale]/auth/native/page.test.ts` |
| `android-menu-chrome-contracts` | contract | `019c95e8#1`, `019c95e8#4`, `019c95e8#5`, `019d0514#1`, `019d2f95#1`, `019d2f95#2`, `019d2f95#3`, `019d43a3#1` | `src/components/LivePhoneDemo/live-phone-demo.chrome-contract.test.ts` |
| `android-shared-stt-restore-contracts` | contract | `019c992c#2`, `019d19a3#1`, `019d4eba#1`, `019d4f37#1` | `src/components/LivePhoneDemo/use-realtime-stt.logic.test.ts` |
| `android-native-stt-reconcile-contracts` | contract | `019d19a3#1`, `019d4eba#1`, `019d4f37#1` | `src/components/LivePhoneDemo/live-phone-demo.android-stt-reconcile.test.ts` |
| `qa-bridge-hydrates-live-demo` | real device | `2026-real-device#1`, `2026-real-device#2` | `scripts/mobile-ui-qa.mjs` |
| `banner-position-updates-insets` | real device | `019d4cae#11`, `019d4cae#12`, `019d4cae#13`, `019d4cae#14`, `019d4cae#15` | `scripts/mobile-ui-qa.mjs` |
| `bottom-anchor-restores-after-storage-hydration` | real device | `019d4cae#23`, `019d4cae#32` | `scripts/mobile-ui-qa.mjs` |
| `composer-roundtrip-restores-compact-bottom-bar` | real device | `019d4cae#9`, `019d4cae#10` | `scripts/mobile-ui-qa.mjs` |
| `empty-state-keeps-single-start-control` | real device | `019d29d5#1` | `scripts/mobile-ui-qa.mjs` |
| `hardware-back-closes-history-overlay` | real device | `019d4cae#4` | `scripts/mobile-ui-qa.mjs` |
| `native-remount-restores-running-mic-state` | real device | `019d4eba#1`, `019d4f37#1` | `scripts/mobile-ui-qa.mjs` |

## Current execution snapshot

- Latest expanded Android suite: `20/21 passed, 1 failed`
- Latest report: [android-regression-suite.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/reports/2026-04-11T16-10-15-111Z/android-regression-suite.md)
- Remaining real-device failure: `native-remount-restores-running-mic-state`

## Notes

- Android now uses both shared WebView contract tests and physical-device Appium cases. The inventory is no longer limited to the original eight real-device checks.
- The banner-position case now uses the QA bridge setter so Android inset regressions can be isolated from menu-panel interaction noise on a physical device.
- The native remount case still depends on a QA-only native status injection because black-box Appium cannot deterministically hold Android STT in the running state during a forced WebView remount.
- See [ANDROID_REGRESSION_BACKLOG.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ANDROID_REGRESSION_BACKLOG.md) for the remaining historical atoms that are still outside the Android inventory.
