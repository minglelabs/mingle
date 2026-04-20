# Android Regression Inventory

This inventory lists the regression targets that are explicitly wired into the current Android mobile suite.

- Historical UI/UX atoms in [mingle-app/docs/ui-ux-codex-thread-history.md](../../docs/ui-ux-codex-thread-history.md): `131`
- Current automated Android validation targets: `27`
- Historical atoms explicitly linked to the Android inventory: `70 / 131`
- Current scope: React Native shell, live-demo WebView, and the shipping `1.1.0` conversations/list/room/navigation surface on Android.

## Executed by `scripts/devbox qa --android-regressions ...`

| Validation target | Mode | Historical issue atoms | Gate |
| --- | --- | --- | --- |
| `android-native-ui-bridge-contracts` | contract | `019d4cae#11`, `019d4cae#12`, `019d4cae#13`, `019d4cae#14`, `019d4cae#15` | `src/components/LivePhoneDemo/live-phone-demo.native-ui.logic.test.ts` |
| `android-native-navigation-history-contracts` | contract | `2026-dev-validation#3` | `src/lib/native-navigation-bridge.test.ts` |
| `android-conversation-list-history-contracts` | contract | `2026-dev-validation#4` | `src/components/conversation-list.logic.test.ts` |
| `android-conversation-list-summary-contracts` | contract | `019d4cae#27`, `019d4cae#28`, `019d4cae#34`, `019d4cae#35`, `019d4cae#36`, `019d4cae#54` | `src/components/conversation-list.logic.test.ts` |
| `android-conversation-row-action-contracts` | contract | `019d4cae#58`, `019d4cae#59`, `019d4cae#67` | `src/components/conversation-list.logic.test.ts` |
| `android-conversation-route-contracts` | contract | `019d4cae#27`, `019d4cae#28`, `019d4cae#32`, `019d4cae#60`, `019d4cae#61` | `src/app/api/conversations/route.test.ts`, `src/app/api/conversations/[conversationId]/route.test.ts`, `src/lib/app-conversations.test.ts` |
| `android-versioned-mobile-route-contracts` | contract | `019d4cae#60`, `019d4cae#69` | `src/app/api/namespace-routing.contract.test.ts`, `src/app/api/feedback.namespace-routing.test.ts` |
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
| `android-shared-stt-restore-contracts` | contract | `019c992c#2`, `019d19a3#1`, `019d4cae#50`, `019d4cae#51`, `019d4cae#52`, `019d4cae#53`, `019d4cae#55`, `019d4cae#78`, `019d4eba#1`, `019d4f37#1` | `src/components/LivePhoneDemo/use-realtime-stt.logic.test.ts` |
| `android-native-stt-reconcile-contracts` | contract | `2026-android-real-device#1`, `019d19a3#1`, `019d4cae#52`, `019d4cae#54`, `019d4cae#55`, `019d4eba#1`, `019d4f37#1` | `src/components/LivePhoneDemo/live-phone-demo.android-stt-reconcile.test.ts` |
| `qa-bridge-hydrates-live-demo` | real device | `2026-real-device#1`, `2026-real-device#2` | `mingle-app/scripts/mobile-ui-qa.mjs` |
| `banner-position-updates-insets` | real device | `019d4cae#11`, `019d4cae#12`, `019d4cae#13`, `019d4cae#14`, `019d4cae#15` | `mingle-app/scripts/mobile-ui-qa.mjs` |
| `bottom-anchor-restores-after-storage-hydration` | real device | `019d4cae#23`, `019d4cae#32` | `mingle-app/scripts/mobile-ui-qa.mjs` |
| `composer-roundtrip-restores-compact-bottom-bar` | real device | `019d4cae#9`, `019d4cae#10` | `mingle-app/scripts/mobile-ui-qa.mjs` |
| `empty-state-keeps-single-start-control` | real device | `019d29d5#1` | `mingle-app/scripts/mobile-ui-qa.mjs` |
| `hardware-back-closes-history-overlay` | real device | `019d4cae#4` | `mingle-app/scripts/mobile-ui-qa.mjs` |
| `native-remount-restores-running-mic-state` | real device | `2026-android-real-device#1`, `019d4eba#1`, `019d4f37#1` | `mingle-app/scripts/mobile-ui-qa.mjs` |

## Notes

- The Android inventory includes both contract targets and Appium targets because either one can be the authoritative guard for a historical atom.
- Atoms that are missing from this inventory are not necessarily missing from mobile automation overall. Some are covered only on iOS, and the rest are classified in [ATOM_CLASSIFICATION.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ATOM_CLASSIFICATION.md).
- Use [ANDROID_REGRESSION_BACKLOG.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ANDROID_REGRESSION_BACKLOG.md) to see which atoms are outside the Android inventory specifically.
