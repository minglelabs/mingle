# iOS Regression Inventory

This inventory lists the regression targets that are explicitly wired into the current iOS mobile suite.

- Historical UI/UX atoms in [docs/ui-ux-codex-thread-history.md](/Users/nam/.codex/worktrees/a92b/mingle/docs/ui-ux-codex-thread-history.md): `131`
- Current automated iOS validation targets: `28`
- Historical atoms explicitly linked to the iOS inventory: `69 / 131`
- Current scope: React Native shell, live-demo WebView, and the shipping `1.1.0` conversations/list/room/navigation surface.

## Executed by `scripts/devbox qa --ios-regressions ...`

| Validation target | Mode | Historical issue atoms | Gate |
| --- | --- | --- | --- |
| `ios-webview-layout-contracts` | contract | `2026-real-device#2`, `019d4cae#5`, `019d4cae#43` | `src/lib/rn-webview-layout.test.ts` |
| `ios-conversation-list-history-contracts` | contract | `2026-dev-validation#4` | `src/components/conversation-list.logic.test.ts` |
| `ios-conversation-list-summary-contracts` | contract | `019d4cae#27`, `019d4cae#28`, `019d4cae#34`, `019d4cae#35`, `019d4cae#36`, `019d4cae#54` | `src/components/conversation-list.logic.test.ts` |
| `ios-conversation-row-action-contracts` | contract | `019d4cae#58`, `019d4cae#59`, `019d4cae#67` | `src/components/conversation-list.logic.test.ts` |
| `ios-conversation-route-contracts` | contract | `019d4cae#27`, `019d4cae#28`, `019d4cae#32`, `019d4cae#60`, `019d4cae#61` | `src/app/api/conversations/route.test.ts`, `src/app/api/conversations/[conversationId]/route.test.ts`, `src/lib/app-conversations.test.ts` |
| `ios-versioned-mobile-route-contracts` | contract | `019d4cae#60`, `019d4cae#69` | `src/app/api/namespace-routing.contract.test.ts`, `src/app/api/feedback.namespace-routing.test.ts` |
| `ios-native-ui-bridge-contracts` | contract | `019d4cae#8`, `019d4cae#11`, `019d4cae#12`, `019d4cae#13`, `019d4cae#14`, `019d4cae#15`, `019d4cae#45` | `src/components/LivePhoneDemo/live-phone-demo.native-ui.logic.test.ts` |
| `ios-scroll-platform-contracts` | contract | `019c6f40#1`, `019c6f40#2`, `019c756e#1` | `src/components/LivePhoneDemo/live-phone-demo.scroll.logic.test.ts` |
| `ios-composer-layout-contracts` | contract | `019d4cae#9`, `019d4cae#10`, `019d4cae#21`, `019d4cae#22` | `src/components/LivePhoneDemo/live-phone-demo.composer.logic.test.ts` |
| `ios-preference-hydration-contracts` | contract | `019d4cae#23`, `019d4cae#32`, `019d2a13#1`, `019d2a3f#1` | `src/components/LivePhoneDemo/live-phone-demo.preferences.test.ts`, `src/components/LivePhoneDemo/live-phone-demo.account-preferences.test.ts` |
| `ios-locale-catalog-contracts` | contract | `019d4cae#22`, `019c95e8#2`, `019c95e8#3`, `019ca08b#5`, `019ca08b#6` | `src/i18n/config.test.ts`, `src/i18n/get-dictionary.test.ts` |
| `ios-localized-surface-copy-contracts` | contract | `019d4cae#21`, `019d4cae#22`, `019c95e8#1`, `019c95e8#2`, `019c95e8#3`, `019ca08b#5`, `019ca08b#6`, `019ca08b#7` | `live-phone-demo.feedback-copy`, `delete-copy`, `copy-actions`, `tts-actions`, `app-update.logic` tests |
| `ios-bubble-structure-contracts` | contract | `019c6f40#3`, `019c992c#1`, `019d09c4#1` | `chat-bubble`, `chat-bubble.timestamp`, `translation-bubble-row` tests |
| `ios-copy-affordance-contracts` | contract | `019d09c4#1`, `019d5714#1` | `copyable-bubble-surface`, `copyable-bubble-surface.logic`, `live-phone-demo.copy` tests |
| `ios-speaker-avatar-contracts` | contract | `019d162b#1` | `speaker-avatar` tests |
| `ios-auth-gate-contracts` | contract | `019ca08b#1`, `019ca08b#2`, `019ca08b#4` | `src/components/mingle-home.auth-contract.test.ts` |
| `ios-native-auth-route-contracts` | contract | `019ca08b#3` | `src/lib/native-auth-bridge.test.ts`, `src/app/[locale]/auth/signin/page.test.ts`, `src/app/[locale]/auth/native/page.test.ts` |
| `ios-menu-chrome-contracts` | contract | `019c95e8#4`, `019c95e8#5`, `019d0514#1`, `019d2f95#1`, `019d2f95#2`, `019d2f95#3`, `019d43a3#1` | `src/components/LivePhoneDemo/live-phone-demo.chrome-contract.test.ts` |
| `ios-native-mic-recovery-contracts` | contract | `019c992c#2`, `019d4cae#41`, `019d4cae#42`, `019d4cae#48`, `019d4cae#49`, `019d4cae#50`, `019d4cae#51`, `019d4cae#52`, `019d4cae#53`, `019d4cae#55`, `019d4caf#1` | `src/components/LivePhoneDemo/use-realtime-stt.logic.test.ts` |
| `qa-bridge-hydrates-live-demo-real-device` | physical iPhone | `2026-real-device#1`, `2026-real-device#2` | `mingle-app/scripts/mobile-ui-qa.mjs` |
| `banner-position-updates-insets-real-device` | physical iPhone | `019d4cae#11`, `019d4cae#12`, `019d4cae#13`, `019d4cae#14`, `019d4cae#15` | `mingle-app/scripts/mobile-ui-qa.mjs` |
| `bottom-anchor-restores-after-storage-hydration-real-device` | physical iPhone | `019d4cae#23`, `019d4cae#32` | `mingle-app/scripts/mobile-ui-qa.mjs` |
| `composer-roundtrip-restores-compact-bottom-bar-real-device` | physical iPhone | `019d4cae#9`, `019d4cae#10` | `mingle-app/scripts/mobile-ui-qa.mjs` |
| `menu-label-matches-korean-locale-real-device` | physical iPhone | `019d4cae#21`, `019d4cae#22`, `019c95e8#2`, `019c95e8#3`, `019ca08b#5`, `019ca08b#6` | `mingle-app/scripts/mobile-ui-qa.mjs` |
| `menu-chrome-keeps-dropdown-cue-and-stable-overlay-real-device` | physical iPhone | `019c95e8#4`, `019c95e8#5`, `019d0514#1`, `019d2f95#1`, `019d2f95#2`, `019d2f95#3`, `019d43a3#1` | `mingle-app/scripts/mobile-ui-qa.mjs` |
| `permission-denial-recovers-to-idle-simulator` | iOS simulator | `019d4cae#41`, `019d4cae#42` | `mingle-app/scripts/mobile-ui-qa.mjs` |
| `menu-label-matches-korean-locale-simulator` | iOS simulator | `019d4cae#21`, `019d4cae#22`, `019c95e8#2`, `019c95e8#3`, `019ca08b#5`, `019ca08b#6` | `mingle-app/scripts/mobile-ui-qa.mjs` |
| `empty-state-keeps-single-start-control-real-device` | physical iPhone | `019d29d5#1` | `mingle-app/scripts/mobile-ui-qa.mjs` |

## Notes

- The iOS inventory includes both contract targets and Appium targets because either one can be the authoritative guard for a historical atom.
- The latest connected physical iPhone run on `2026-04-12` finished at `6 / 7 passed`; the remaining failing target is `banner-position-updates-insets-real-device`, which currently reproduces the in-room top-banner regression family instead of a runner/bootstrap failure.
- Atoms that are missing from this inventory are not necessarily missing from mobile automation overall. Some are covered only on Android, and the rest are classified in [ATOM_CLASSIFICATION.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ATOM_CLASSIFICATION.md).
- Use [IOS_REGRESSION_BACKLOG.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/IOS_REGRESSION_BACKLOG.md) to see which atoms are outside the iOS inventory specifically.
